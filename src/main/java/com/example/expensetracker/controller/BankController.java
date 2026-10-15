package com.example.expensetracker.controller;

import com.example.expensetracker.dto.ApiResponse;
import com.example.expensetracker.dto.BankStatusDto;
import com.example.expensetracker.dto.BankSyncResultDto;
import com.example.expensetracker.dto.MockBankTransactionDto;
import com.example.expensetracker.service.BankService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/bank/mock")
public class BankController {

    @Autowired
    private BankService bankService;

    @GetMapping("/status")
    public ResponseEntity<ApiResponse<BankStatusDto>> getStatus() {
        BankStatusDto status = bankService.getStatus();
        return ResponseEntity.ok(ApiResponse.success("Bank status fetched", status));
    }

    @GetMapping("/transactions")
    public ResponseEntity<ApiResponse<List<MockBankTransactionDto>>> getMockTransactions() {
        List<MockBankTransactionDto> transactions = bankService.getMockTransactions();
        return ResponseEntity.ok(ApiResponse.success("Mock transactions fetched", transactions));
    }

    @PostMapping("/connect")
    public ResponseEntity<ApiResponse<BankStatusDto>> connect() {
        BankStatusDto connected = bankService.connect();
        return ResponseEntity.ok(ApiResponse.success("Demo Bank connected successfully.", connected));
    }

    @PostMapping("/disconnect")
    public ResponseEntity<ApiResponse<BankStatusDto>> disconnect() {
        BankStatusDto disconnected = bankService.disconnect();
        return ResponseEntity.ok(ApiResponse.success("Demo Bank disconnected.", disconnected));
    }

    @PostMapping("/sync")
    public ResponseEntity<ApiResponse<BankSyncResultDto>> sync() {
        BankSyncResultDto result = bankService.sync();
        String message = result.getNewImported() > 0
                ? "Sync complete! Imported " + result.getNewImported() + " new transactions."
                : "Transactions synchronized successfully! 0 new transactions found.";
        return ResponseEntity.ok(ApiResponse.success(message, result));
    }
}
