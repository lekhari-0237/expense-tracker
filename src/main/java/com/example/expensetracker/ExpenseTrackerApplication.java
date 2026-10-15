package com.example.expensetracker;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

@SpringBootApplication
public class ExpenseTrackerApplication {

    private static final Logger log = LoggerFactory.getLogger(ExpenseTrackerApplication.class);

    public static void main(String[] args) {
        loadDotEnv();
        SpringApplication.run(ExpenseTrackerApplication.class, args);
    }

    /**
     * Loads .env key-value pairs into System properties before Spring Boot boots up.
     * Searches current directory and parent directory tree.
     */
    public static void loadDotEnv() {
        String[] candidatePaths = {
                ".env",
                "../.env",
                "../../.env"
        };

        for (String candidate : candidatePaths) {
            Path path = Paths.get(candidate);
            if (Files.exists(path) && Files.isRegularFile(path)) {
                try {
                    List<String> lines = Files.readAllLines(path);
                    int loadedCount = 0;
                    for (String line : lines) {
                        line = line.trim();
                        if (line.isEmpty() || line.startsWith("#")) {
                            continue;
                        }
                        int eqIdx = line.indexOf('=');
                        if (eqIdx > 0) {
                            String key = line.substring(0, eqIdx).trim();
                            String value = line.substring(eqIdx + 1).trim();
                            if ((value.startsWith("\"") && value.endsWith("\"")) ||
                                (value.startsWith("'") && value.endsWith("'"))) {
                                value = value.substring(1, value.length() - 1);
                            }
                            // Set property only if not already passed via command line or OS env
                            if (System.getProperty(key) == null && System.getenv(key) == null) {
                                System.setProperty(key, value);
                                loadedCount++;
                            }
                        }
                    }
                    log.info("Successfully loaded {} variables from .env ({})", loadedCount, path.toAbsolutePath());
                    break;
                } catch (Exception e) {
                    log.warn("Could not load .env file from {}: {}", candidate, e.getMessage());
                }
            }
        }
    }
}
