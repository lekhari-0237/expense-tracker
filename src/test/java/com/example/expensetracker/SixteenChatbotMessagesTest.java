package com.example.expensetracker;

import com.example.expensetracker.dto.RegisterRequest;
import com.example.expensetracker.entity.Bill;
import com.example.expensetracker.entity.Transaction;
import com.example.expensetracker.entity.User;
import com.example.expensetracker.repository.BillRepository;
import com.example.expensetracker.repository.TransactionRepository;
import com.example.expensetracker.repository.UserRepository;
import com.example.expensetracker.security.UserPrincipal;
import com.example.expensetracker.service.AuthService;
import com.example.expensetracker.service.chatbot.ChatService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Comparator;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
public class SixteenChatbotMessagesTest {

    @Autowired
    private ChatService chatService;

    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private BillRepository billRepository;

    private User testUser;

    @BeforeEach
    public void setup() {
        ExpenseTrackerApplication.loadDotEnv();

        // Ensure unique test user
        String username = "botrunner_" + System.currentTimeMillis();
        testUser = authService.registerUser(new RegisterRequest(username, "pass123", "pass123"));

        UserPrincipal principal = UserPrincipal.create(testUser);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @Test
    @DisplayName("Execute and verify all 16 Chatbot test cases with exact DB changes")
    public void runAll16TestMessages() {
        System.out.println("\n=======================================================");
        System.out.println("  STARTING EXECUTION OF ALL 16 EXPENSEBOT TEST MESSAGES");
        System.out.println("=======================================================\n");

        // --- TEST 1 ---
        String m1 = "Add ₹250 for lunch today";
        int count1Before = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        String r1 = chatService.processMessage(m1);
        List<Transaction> txs1 = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId());
        int count1After = txs1.size();
        Transaction t1 = txs1.stream().max(Comparator.comparing(Transaction::getId)).orElse(null);
        printTestResult(1, m1, r1, count1Before, count1After, t1);
        assertEquals(count1Before + 1, count1After);
        assertTrue(r1.contains("Added ₹250 under Food"));

        // --- TEST 2 ---
        String m2 = "I spent ₹1,200 on groceries yesterday";
        int count2Before = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        String r2 = chatService.processMessage(m2);
        List<Transaction> txs2 = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId());
        int count2After = txs2.size();
        Transaction t2 = txs2.stream().max(Comparator.comparing(Transaction::getId)).orElse(null);
        printTestResult(2, m2, r2, count2Before, count2After, t2);
        assertEquals(count2Before + 1, count2After);
        assertTrue(r2.contains("Added ₹1,200 under Food"));

        // --- TEST 3 ---
        String m3 = "Log a ₹500 auto fare under transport";
        int count3Before = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        String r3 = chatService.processMessage(m3);
        List<Transaction> txs3 = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId());
        int count3After = txs3.size();
        Transaction t3 = txs3.stream().max(Comparator.comparing(Transaction::getId)).orElse(null);
        printTestResult(3, m3, r3, count3Before, count3After, t3);
        assertEquals(count3Before + 1, count3After);
        assertTrue(r3.contains("Added ₹500 under Transport"));

        // --- TEST 4 ---
        String m4 = "Record my electricity bill of ₹1,850 paid on the 5th";
        int count4Before = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        String r4 = chatService.processMessage(m4);
        List<Transaction> txs4 = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId());
        int count4After = txs4.size();
        Transaction t4 = txs4.stream().max(Comparator.comparing(Transaction::getId)).orElse(null);
        printTestResult(4, m4, r4, count4Before, count4After, t4);
        assertEquals(count4Before + 1, count4After);
        assertTrue(r4.contains("Added ₹1,850 under Bills"));

        // --- TEST 5 (Two-Step Delete Flow) ---
        String m5a = "Delete my last expense";
        int count5aBefore = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        String r5a = chatService.processMessage(m5a);
        int count5aAfter = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        printTestResult(5, m5a + " (Step 1: Prompt)", r5a, count5aBefore, count5aAfter, null);
        assertEquals(count5aBefore, count5aAfter); // No DB change until confirmed
        assertTrue(r5a.contains("Delete it? (yes/no)"));
        assertTrue(r5a.contains("1,850"));

        String m5b = "yes";
        int count5bBefore = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        String r5b = chatService.processMessage(m5b);
        int count5bAfter = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        printTestResult(5, m5b + " (Step 2: Confirm Yes)", r5b, count5bBefore, count5bAfter, t4);
        assertEquals(count5bBefore - 1, count5bAfter); // Successfully deleted!
        assertTrue(r5b.contains("Deleted ₹1,850 Bills"));

        // --- TEST 6 ---
        String m6 = "Edit the amount of my last entry to ₹300";
        int count6Before = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        String r6 = chatService.processMessage(m6);
        List<Transaction> txs6 = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId());
        int count6After = txs6.size();
        Transaction t6 = txs6.stream().max(Comparator.comparing(Transaction::getId)).orElse(null);
        printTestResult(6, m6, r6, count6Before, count6After, t6);
        assertEquals(count6Before, count6After);
        assertTrue(r6.contains("from ₹500 to ₹300"));

        // --- TEST 7 ---
        String m7 = "How much did I spend this month?";
        int count7Before = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        String r7 = chatService.processMessage(m7);
        int count7After = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        printTestResult(7, m7, r7, count7Before, count7After, null);
        assertEquals(count7Before, count7After);
        assertTrue(r7.contains("You spent ₹1,750 this month"));

        // --- TEST 8 ---
        String m8 = "What did I spend on food last month?";
        int count8Before = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        String r8 = chatService.processMessage(m8);
        int count8After = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        printTestResult(8, m8, r8, count8Before, count8After, null);
        assertEquals(count8Before, count8After);
        assertTrue(r8.contains("No expenses found for that period"));

        // --- TEST 9 ---
        String m9 = "Show my last 10 transactions";
        int count9Before = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        String r9 = chatService.processMessage(m9);
        int count9After = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        printTestResult(9, m9, r9, count9Before, count9After, null);
        assertEquals(count9Before, count9After);
        assertTrue(r9.contains("last 3 transactions"));

        // --- TEST 10 ---
        String m10 = "Which category do I spend the most on?";
        int count10Before = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        String r10 = chatService.processMessage(m10);
        int count10After = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        printTestResult(10, m10, r10, count10Before, count10After, null);
        assertEquals(count10Before, count10After);
        assertTrue(r10.contains("Food this month: ₹1,450"));

        // --- TEST 11 ---
        String m11 = "Compare this month's spending with last month";
        int count11Before = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        String r11 = chatService.processMessage(m11);
        int count11After = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        printTestResult(11, m11, r11, count11Before, count11After, null);
        assertEquals(count11Before, count11After);
        assertTrue(r11.contains("You spent ₹1,750 this month vs ₹0 last month"));

        // --- TEST 12 ---
        String m12 = "Add a recurring expense of ₹499 for Netflix every month";
        int count12Before = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        String r12 = chatService.processMessage(m12);
        int count12After = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        List<Bill> bills = billRepository.findByUserIdOrderByDueDateAsc(testUser.getId());
        Bill netflixBill = bills.stream().filter(b -> b.getBillName().equalsIgnoreCase("Netflix")).findFirst().orElse(null);
        printBillResult(12, m12, r12, count12Before, count12After, netflixBill);
        assertEquals(count12Before, count12After); // Bills are not transactions
        assertNotNull(netflixBill);
        assertTrue(r12.contains("Created bill reminder for Netflix (₹499)"));

        // --- TEST 13 ---
        String m13 = "List my upcoming bills";
        int count13Before = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        String r13 = chatService.processMessage(m13);
        int count13After = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        printTestResult(13, m13, r13, count13Before, count13After, null);
        assertEquals(count13Before, count13After);
        assertTrue(r13.contains("Netflix: ₹499"));

        // --- TEST 14 ---
        String m14 = "Export my expenses as Excel";
        int count14Before = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        String r14 = chatService.processMessage(m14);
        int count14After = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        printTestResult(14, m14, r14, count14Before, count14After, null);
        assertEquals(count14Before, count14After);
        assertTrue(r14.contains("[Download Excel Report](/api/export/excel)"));

        // --- TEST 15 ---
        String m15 = "Set a monthly budget of ₹20,000";
        int count15Before = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        String r15 = chatService.processMessage(m15);
        int count15After = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        printTestResult(15, m15, r15, count15Before, count15After, null);
        assertEquals(count15Before, count15After);
        assertTrue(r15.contains("Budgets aren't available in the app yet"));

        // --- TEST 16 ---
        String m16 = "Reset all my data";
        int count16Before = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        String r16 = chatService.processMessage(m16);
        int count16After = transactionRepository.findByUserIdOrderByDateDesc(testUser.getId()).size();
        printTestResult(16, m16, r16, count16Before, count16After, null);
        assertEquals(count16Before, count16After); // Data safe, nothing deleted!
        assertTrue(r16.contains("I can't delete everything from chat"));

        System.out.println("\n=======================================================");
        System.out.println("  ALL 16 EXPENSEBOT TEST CASES COMPLETED & VERIFIED!");
        System.out.println("=======================================================\n");
    }

    private void printTestResult(int testNum, String msg, String reply, int countBefore, int countAfter, Transaction row) {
        System.out.println("----------------------------------------------------------------------");
        System.out.println("TEST #" + testNum + ": \"" + msg + "\"");
        System.out.println("BOT EXACT REPLY: " + reply.replace("\n", " "));
        System.out.println("DB TRANSACTION COUNT: " + countBefore + " -> " + countAfter + " (delta: " + (countAfter - countBefore) + ")");
        if (row != null) {
            System.out.println("AFFECTED ROW: [ID=" + row.getId() + ", Category=" + row.getCategory() +
                    ", Amount=₹" + row.getAmount() + ", Date=" + row.getDate() + ", Description=" + row.getDescription() + "]");
        } else {
            System.out.println("AFFECTED ROW: (None / Read-only query / Refusal safely prevented modification)");
        }
    }

    private void printBillResult(int testNum, String msg, String reply, int countBefore, int countAfter, Bill bill) {
        System.out.println("----------------------------------------------------------------------");
        System.out.println("TEST #" + testNum + ": \"" + msg + "\"");
        System.out.println("BOT EXACT REPLY: " + reply.replace("\n", " "));
        System.out.println("DB TRANSACTION COUNT: " + countBefore + " -> " + countAfter + " (delta: 0, Bill entity created)");
        if (bill != null) {
            System.out.println("AFFECTED BILL ROW: [ID=" + bill.getId() + ", BillName=" + bill.getBillName() +
                    ", Amount=₹" + bill.getAmount() + ", Category=" + bill.getCategory() + ", DueDate=" + bill.getDueDate() + "]");
        }
    }
}
