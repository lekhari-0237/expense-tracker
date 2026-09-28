package com.example.expensetracker.controller;

import com.example.expensetracker.dto.ApiResponse;
import com.example.expensetracker.dto.ReceiptScanDto;
import com.example.expensetracker.dto.TransactionDto;
import com.example.expensetracker.entity.TransactionType;
import com.example.expensetracker.service.ReceiptOcrService;
import com.example.expensetracker.service.TransactionService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api")
public class ExpenseTrackerController {

    @Autowired
    private TransactionService transactionService;

    @Autowired
    private ReceiptOcrService receiptOcrService;

    @GetMapping("/expenses")
    public ResponseEntity<ApiResponse<List<TransactionDto>>> getAllExpenses() {
        return ResponseEntity.ok(ApiResponse.success("Fetched expenses", transactionService.getAllTransactions()));
    }

    @GetMapping("/expenses/{id}")
    public ResponseEntity<ApiResponse<TransactionDto>> getExpenseById(@PathVariable Long id) {
        TransactionDto dto = transactionService.getTransactionById(id);
        return ResponseEntity.ok(ApiResponse.success("Fetched expense successfully", dto));
    }

    @PostMapping("/expenses")
    public ResponseEntity<ApiResponse<TransactionDto>> createExpense(@Valid @RequestBody TransactionDto dto) {
        if (dto.getType() == null) {
            dto.setType(TransactionType.EXPENSE);
        }
        TransactionDto created = transactionService.createTransaction(dto);
        return ResponseEntity.ok(ApiResponse.success("Expense added successfully", created));
    }

    @PutMapping("/expenses/{id}")
    public ResponseEntity<ApiResponse<TransactionDto>> updateExpense(@PathVariable Long id, @Valid @RequestBody TransactionDto dto) {
        if (dto.getType() == null) {
            dto.setType(TransactionType.EXPENSE);
        }
        TransactionDto updated = transactionService.updateTransaction(id, dto);
        return ResponseEntity.ok(ApiResponse.success("Expense updated successfully", updated));
    }

    @DeleteMapping("/expenses/{id}")
    public ResponseEntity<ApiResponse<Object>> deleteExpense(@PathVariable Long id) {
        transactionService.deleteTransaction(id);
        return ResponseEntity.ok(ApiResponse.success("Expense deleted successfully"));
    }

    @PostMapping("/ocr")
    public ResponseEntity<ApiResponse<ReceiptScanDto>> uploadOcrReceipt(@RequestParam("file") MultipartFile file) {
        ReceiptScanDto result = receiptOcrService.scanReceipt(file);
        return ResponseEntity.ok(ApiResponse.success("Receipt scanned successfully", result));
    }
}
