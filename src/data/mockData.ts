export const mockWallets = [
    {
        id: "1",
        name: "Cash",
        balance: 1250.00,
        type: "cash",
        color: "#5D6D7E",
    },
    {
        id: "2",
        name: "Bank Account",
        balance: 8432.50,
        type: "bank",
        color: "#4A5568",
    },
    {
        id: "3",
        name: "Mobile Money",
        balance: 356.75,
        type: "mobile",
        color: "#6B7280",
    },
    {
        id: "4",
        name: "Savings",
        balance: 15000.00,
        type: "savings",
        color: "#78716C",
    },
];

const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const twoDaysAgo = new Date(today);
twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

export const mockTransactions = [
    {
        id: "1",
        title: "Grocery Shopping",
        category: "shopping",
        amount: 85.50,
        type: "expense",
        date: new Date(today.setHours(14, 30)).toISOString(),
        wallet: "Cash",
    },
    {
        id: "2",
        title: "Coffee Break",
        category: "food",
        amount: 12.00,
        type: "expense",
        date: new Date(today.setHours(10, 15)).toISOString(),
        wallet: "Cash",
    },
    {
        id: "3",
        title: "Monthly Salary",
        category: "salary",
        amount: 4500.00,
        type: "income",
        date: new Date(yesterday.setHours(9, 0)).toISOString(),
        wallet: "Bank Account",
    },
    {
        id: "4",
        title: "Uber Ride",
        category: "transport",
        amount: 24.50,
        type: "expense",
        date: new Date(yesterday.setHours(18, 45)).toISOString(),
        wallet: "Mobile Money",
    },
    {
        id: "5",
        title: "Netflix Subscription",
        category: "entertainment",
        amount: 15.99,
        type: "expense",
        date: new Date(twoDaysAgo.setHours(0, 0)).toISOString(),
        wallet: "Bank Account",
    },
    {
        id: "6",
        title: "Electricity Bill",
        category: "utilities",
        amount: 120.00,
        type: "expense",
        date: new Date(twoDaysAgo.setHours(11, 30)).toISOString(),
        wallet: "Bank Account",
    },
    {
        id: "7",
        title: "Freelance Payment",
        category: "income",
        amount: 750.00,
        type: "income",
        date: new Date(twoDaysAgo.setHours(15, 0)).toISOString(),
        wallet: "Bank Account",
    },
];

export const mockSpendingData = [
    { name: "Shopping", value: 420, color: "#E57373" },
    { name: "Food", value: 280, color: "#FFB74D" },
    { name: "Transport", value: 180, color: "#64B5F6" },
    { name: "Entertainment", value: 150, color: "#4DD0E1" },
    { name: "Utilities", value: 200, color: "#BA68C8" },
];

export const mockBudget = {
    spent: 1850,
    budget: 2500,
};
