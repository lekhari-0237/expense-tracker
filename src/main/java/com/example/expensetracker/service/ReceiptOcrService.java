package com.example.expensetracker.service;

import com.example.expensetracker.dto.ReceiptScanDto;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class ReceiptOcrService {

    private static final Logger logger = LoggerFactory.getLogger(ReceiptOcrService.class);

    @Value("${OCR_SPACE_API_KEY:}")
    private String apiKeyEnv;

    public ReceiptScanDto scanReceipt(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            logger.warn("OCR Scan attempt failed: File is null or empty");
            return new ReceiptScanDto(null, null, null, "Other", "", 0.0, false, "Uploaded receipt image is empty", "FAILURE");
        }

        String fileName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "receipt.jpg";
        long fileSize = file.getSize();
        logger.info("Receipt file received: filename={}, size={} bytes", fileName, fileSize);

        String apiKey = (apiKeyEnv != null && !apiKeyEnv.trim().isEmpty()) ? apiKeyEnv.trim() : System.getenv("OCR_SPACE_API_KEY");
        if (apiKey == null || apiKey.trim().isEmpty()) {
            logger.info("OCR_SPACE_API_KEY environment variable not set. Falling back to public testing key 'helloworld'");
            apiKey = "helloworld";
        }

        String rawText = "";
        try {
            logger.info("Calling cloud OCR API (OCR.space) at https://api.ocr.space/parse/image...");

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);
            headers.set("apikey", apiKey);

            ByteArrayResource fileResource = new ByteArrayResource(file.getBytes()) {
                @Override
                public String getFilename() {
                    return fileName;
                }
            };

            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
            body.add("file", fileResource);
            body.add("apikey", apiKey);
            body.add("language", "eng");
            body.add("isOverlayRequired", "false");
            body.add("detectOrientation", "true");
            body.add("scale", "true");
            body.add("OCREngine", "2");

            HttpEntity<MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);
            RestTemplate restTemplate = new RestTemplate();

            ResponseEntity<String> response = restTemplate.postForEntity("https://api.ocr.space/parse/image", requestEntity, String.class);
            logger.info("OCR API HTTP response status: {}", response.getStatusCode());

            if (response.getBody() != null) {
                ObjectMapper mapper = new ObjectMapper();
                JsonNode root = mapper.readTree(response.getBody());

                boolean isErrored = root.path("IsErroredOnProcessing").asBoolean(false);
                int exitCode = root.path("OCRExitCode").asInt(0);

                if (isErrored || exitCode != 1) {
                    String errorMsg = "OCR processing failed";
                    if (root.has("ErrorMessage") && root.get("ErrorMessage").isArray() && root.get("ErrorMessage").size() > 0) {
                        errorMsg = root.get("ErrorMessage").get(0).asText();
                    } else if (root.has("ErrorMessage")) {
                        errorMsg = root.path("ErrorMessage").asText();
                    }
                    logger.error("OCR API error response: exitCode={}, message={}", exitCode, errorMsg);
                    return new ReceiptScanDto(null, null, null, "Other", "", 0.0, false, "OCR API failed: " + errorMsg, "FAILURE");
                }

                JsonNode parsedResults = root.path("ParsedResults");
                if (parsedResults.isArray() && parsedResults.size() > 0) {
                    rawText = parsedResults.get(0).path("ParsedText").asText("");
                }
            }
        } catch (Exception e) {
            logger.error("Error during OCR API call to OCR.space: {}", e.getMessage(), e);
            return new ReceiptScanDto(null, null, null, "Other", "", 0.0, false, "Failed to reach OCR cloud API: " + e.getMessage(), "FAILURE");
        }

        int rawTextLength = rawText != null ? rawText.trim().length() : 0;
        logger.info("Raw OCR text length: {} chars", rawTextLength);

        if (rawText == null || rawText.trim().isEmpty()) {
            logger.warn("OCR API returned empty text for receipt: {}", fileName);
            return new ReceiptScanDto(null, null, null, "Other", "", 0.0, false, "No readable text found in receipt image", "FAILURE");
        }

        return parseReceiptText(rawText.trim(), true);
    }

    public ReceiptScanDto parseReceiptText(String rawText, boolean ocrSuccess) {
        BigDecimal extractedAmount = extractTotalAmount(rawText);
        String merchantName = extractMerchantName(rawText);
        LocalDate date = extractDate(rawText);
        String category = guessCategory(rawText, merchantName);

        boolean amountDetected = (extractedAmount != null && extractedAmount.compareTo(BigDecimal.ZERO) > 0);
        boolean merchantDetected = (merchantName != null && !merchantName.trim().isEmpty());

        logger.info("OCR Extraction Results - Amount: {}, Merchant: {}, Date: {}, Category: {}",
                extractedAmount, merchantName, date, category);

        String status;
        String message;
        if (amountDetected && merchantDetected) {
            status = "SUCCESS";
            message = "Receipt scanned successfully.";
        } else if (amountDetected || merchantDetected) {
            status = "PARTIAL";
            message = "Extracted partial receipt details. Please verify remaining fields.";
        } else {
            status = "PARTIAL";
            message = "Could not confidently detect total amount or merchant. Please enter details manually.";
        }

        return new ReceiptScanDto(
                extractedAmount,
                merchantName,
                date,
                category,
                rawText.trim(),
                ocrSuccess ? 0.95 : 0.50,
                amountDetected || merchantDetected,
                message,
                status
        );
    }

    private BigDecimal extractTotalAmount(String text) {
        if (text == null || text.trim().isEmpty()) return null;

        // 1. Priority: Match Explicit Grand Total / Total Amount / Amount Payable / Net Total labels
        Pattern grandTotalPattern = Pattern.compile(
                "(?i)(?:grand\\s+total|total\\s+amount|amount\\s+payable|net\\s+total|net\\s+amount|balance\\s+due|amount\\s+due|total\\s+payable|to\\s+pay|final\\s+total)\\D*?([₹$€£]|rs\\.?|inr\\.?)?\\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)",
                Pattern.CASE_INSENSITIVE
        );
        Matcher matcher = grandTotalPattern.matcher(text);
        List<BigDecimal> highPriorityAmounts = new ArrayList<>();

        while (matcher.find()) {
            String numGroup = matcher.group(2);
            if (numGroup != null && !numGroup.isEmpty()) {
                String cleanNum = numGroup.replaceAll("[^0-9\\.]", "");
                try {
                    BigDecimal bd = new BigDecimal(cleanNum);
                    if (bd.compareTo(BigDecimal.ZERO) > 0) {
                        highPriorityAmounts.add(bd);
                    }
                } catch (Exception ignored) {}
            }
        }

        if (!highPriorityAmounts.isEmpty()) {
            return highPriorityAmounts.stream().max(BigDecimal::compareTo).orElse(null);
        }

        // 2. Secondary: Match general "TOTAL" keyword
        Pattern generalTotalPattern = Pattern.compile(
                "(?i)(?:total|sum|amt|amount)\\D*?([₹$€£]|rs\\.?|inr\\.?)?\\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)",
                Pattern.CASE_INSENSITIVE
        );
        Matcher genMatcher = generalTotalPattern.matcher(text);
        List<BigDecimal> genAmounts = new ArrayList<>();

        while (genMatcher.find()) {
            String numGroup = genMatcher.group(2);
            if (numGroup != null && !numGroup.isEmpty()) {
                String cleanNum = numGroup.replaceAll("[^0-9\\.]", "");
                try {
                    BigDecimal bd = new BigDecimal(cleanNum);
                    if (bd.compareTo(BigDecimal.ZERO) > 0) {
                        genAmounts.add(bd);
                    }
                } catch (Exception ignored) {}
            }
        }

        if (!genAmounts.isEmpty()) {
            return genAmounts.stream().max(BigDecimal::compareTo).orElse(null);
        }

        // 3. Fallback: Standalone currency numbers (e.g. ₹499.90, Rs. 450.00, INR 1250)
        Pattern standalonePattern = Pattern.compile("(?:^|\\s)(?:[₹$€£]|rs\\.?|inr\\.?)?\\s*([0-9]{1,3}(?:,[0-9]{3})*\\.[0-9]{2}|[0-9]+\\.[0-9]{2})(?:\\s|$)", Pattern.MULTILINE | Pattern.CASE_INSENSITIVE);
        Matcher numMatcher = standalonePattern.matcher(text);
        List<BigDecimal> standaloneAmounts = new ArrayList<>();

        while (numMatcher.find()) {
            try {
                String cleanNum = numMatcher.group(1).replaceAll("[^0-9\\.]", "");
                BigDecimal bd = new BigDecimal(cleanNum);
                if (bd.compareTo(BigDecimal.ZERO) > 0) {
                    standaloneAmounts.add(bd);
                }
            } catch (Exception ignored) {}
        }

        if (!standaloneAmounts.isEmpty()) {
            return standaloneAmounts.stream().max(BigDecimal::compareTo).orElse(null);
        }

        // Return null if amount cannot be detected with confidence (never return 0)
        return null;
    }

    private String extractMerchantName(String text) {
        if (text == null || text.trim().isEmpty()) return null;

        String[] lines = text.split("\\r?\\n");
        for (int i = 0; i < Math.min(lines.length, 10); i++) {
            String trimmed = lines[i].trim();
            if (trimmed.length() < 3) continue;

            String lower = trimmed.toLowerCase(Locale.ENGLISH);
            // Skip generic receipt header noise
            if (lower.contains("receipt") || lower.contains("tax invoice") || lower.contains("welcome") ||
                lower.contains("cash memo") || lower.contains("customer copy") || lower.contains("date") ||
                lower.contains("tel:") || lower.contains("phone") || lower.contains("gst") || lower.contains("gstin") ||
                lower.contains("thank you") || lower.contains("bill no") || lower.contains("order no") ||
                lower.contains("invoice") || lower.contains("original copy") || lower.contains("duplicate")) {
                continue;
            }

            String cleanName = trimmed.replaceAll("[^a-zA-Z0-9\\s&'-]", "").trim();
            if (cleanName.length() >= 3) {
                return cleanName;
            }
        }
        // Return null if merchant cannot be extracted (never return fake "Store Purchase")
        return null;
    }

    private LocalDate extractDate(String text) {
        if (text == null || text.trim().isEmpty()) return null;

        // European / Indian format (DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY)
        Pattern eurPattern = Pattern.compile("\\b(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})\\b");
        Matcher eurMatcher = eurPattern.matcher(text);
        if (eurMatcher.find()) {
            try {
                int d = Integer.parseInt(eurMatcher.group(1));
                int m = Integer.parseInt(eurMatcher.group(2));
                int y = Integer.parseInt(eurMatcher.group(3));
                if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
                    return LocalDate.of(y, m, d);
                }
            } catch (Exception ignored) {}
        }

        // ISO format (YYYY-MM-DD)
        Pattern isoPattern = Pattern.compile("\\b(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})\\b");
        Matcher isoMatcher = isoPattern.matcher(text);
        if (isoMatcher.find()) {
            try {
                int y = Integer.parseInt(isoMatcher.group(1));
                int m = Integer.parseInt(isoMatcher.group(2));
                int d = Integer.parseInt(isoMatcher.group(3));
                if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
                    return LocalDate.of(y, m, d);
                }
            } catch (Exception ignored) {}
        }

        // Textual format: "09 Sep 2026" or "09-Sep-2026"
        Pattern textDatePattern1 = Pattern.compile("(?i)\\b(\\d{1,2})[\\s/-]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\\s/-]+(\\d{4})\\b");
        Matcher textMatcher1 = textDatePattern1.matcher(text);
        if (textMatcher1.find()) {
            try {
                int d = Integer.parseInt(textMatcher1.group(1));
                String monthStr = textMatcher1.group(2).toLowerCase(Locale.ENGLISH);
                int y = Integer.parseInt(textMatcher1.group(3));
                int m = parseMonthName(monthStr);
                if (m > 0) return LocalDate.of(y, m, d);
            } catch (Exception ignored) {}
        }

        // Textual format: "September 9, 2026" or "Sep 9 2026"
        Pattern textDatePattern2 = Pattern.compile("(?i)\\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\\s/-]+(\\d{1,2}),?[\\s/-]+(\\d{4})\\b");
        Matcher textMatcher2 = textDatePattern2.matcher(text);
        if (textMatcher2.find()) {
            try {
                String monthStr = textMatcher2.group(1).toLowerCase(Locale.ENGLISH);
                int d = Integer.parseInt(textMatcher2.group(2));
                int y = Integer.parseInt(textMatcher2.group(3));
                int m = parseMonthName(monthStr);
                if (m > 0) return LocalDate.of(y, m, d);
            } catch (Exception ignored) {}
        }

        // Return null if date cannot be extracted (never silently default to today's date)
        return null;
    }

    private int parseMonthName(String month) {
        if (month.startsWith("jan")) return 1;
        if (month.startsWith("feb")) return 2;
        if (month.startsWith("mar")) return 3;
        if (month.startsWith("apr")) return 4;
        if (month.startsWith("may")) return 5;
        if (month.startsWith("jun")) return 6;
        if (month.startsWith("jul")) return 7;
        if (month.startsWith("aug")) return 8;
        if (month.startsWith("sep")) return 9;
        if (month.startsWith("oct")) return 10;
        if (month.startsWith("nov")) return 11;
        if (month.startsWith("dec")) return 12;
        return 0;
    }

    private String guessCategory(String text, String merchantName) {
        String combined = ((text != null ? text : "") + " " + (merchantName != null ? merchantName : "")).toLowerCase(Locale.ENGLISH);

        if (combined.contains("restaurant") || combined.contains("cafe") || combined.contains("coffee") ||
            combined.contains("mcdonald") || combined.contains("burger") || combined.contains("pizza") ||
            combined.contains("bakery") || combined.contains("food") || combined.contains("dining") ||
            combined.contains("swiggy") || combined.contains("zomato") || combined.contains("dominos") ||
            combined.contains("kfc") || combined.contains("starbucks") || combined.contains("diner") ||
            combined.contains("biryani") || combined.contains("hotel") || combined.contains("kitchen") || combined.contains("mess")) {
            return "Food";
        }

        if (combined.contains("uber") || combined.contains("ola") || combined.contains("taxi") ||
            combined.contains("fuel") || combined.contains("petrol") || combined.contains("diesel") ||
            combined.contains("shell") || combined.contains("hp") || combined.contains("iocl") || combined.contains("bpcl") ||
            combined.contains("metro") || combined.contains("parking") || combined.contains("bus") ||
            combined.contains("toll") || combined.contains("flight") || combined.contains("railway") ||
            combined.contains("auto") || combined.contains("irctc")) {
            return "Transport";
        }

        if (combined.contains("amazon") || combined.contains("flipkart") || combined.contains("myntra") ||
            combined.contains("walmart") || combined.contains("target") || combined.contains("supermarket") ||
            combined.contains("store") || combined.contains("apparel") || combined.contains("fashion") ||
            combined.contains("mall") || combined.contains("retail") || combined.contains("clothing") ||
            combined.contains("dmart") || combined.contains("reliance") || combined.contains("bigbasket") ||
            combined.contains("grocery") || combined.contains("spencers")) {
            return "Shopping";
        }

        if (combined.contains("pharmacy") || combined.contains("chemist") || combined.contains("hospital") ||
            combined.contains("clinic") || combined.contains("doctor") || combined.contains("medical") ||
            combined.contains("health") || combined.contains("apollo") || combined.contains("medplus") ||
            combined.contains("diagnostics") || combined.contains("wellness")) {
            return "Healthcare";
        }

        if (combined.contains("electricity") || combined.contains("water") || combined.contains("internet") ||
            combined.contains("wifi") || combined.contains("airtel") || combined.contains("jio") || combined.contains("vi") ||
            combined.contains("utility") || combined.contains("bill") || combined.contains("recharge") || combined.contains("gas")) {
            return "Bills";
        }

        if (combined.contains("school") || combined.contains("college") || combined.contains("tuition") ||
            combined.contains("book") || combined.contains("university") || combined.contains("udemy") ||
            combined.contains("coursera") || combined.contains("education")) {
            return "Education";
        }

        if (combined.contains("cinema") || combined.contains("movie") || combined.contains("pvr") ||
            combined.contains("inox") || combined.contains("theater") || combined.contains("event") ||
            combined.contains("ticket") || combined.contains("game") || combined.contains("netflix") ||
            combined.contains("hotstar")) {
            return "Entertainment";
        }

        if (combined.contains("rent") || combined.contains("deposit")) {
            return "Rent";
        }

        // Return Other for unrecognized receipts (never default to Shopping or Food)
        return "Other";
    }
}
