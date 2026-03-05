/**
 * FAQ Data
 *
 * Static FAQ content for the Help & FAQ screen.
 * Kept as a constant array — no network dependency, fully offline.
 */

export interface FAQItem {
    id: string;
    question: string;
    answer: string;
}

export const FAQ_DATA: FAQItem[] = [
    {
        id: 'add-transaction',
        question: 'How do I add a transaction?',
        answer:
            'Tap the Quick Actions on the dashboard and choose "Add Expense" or "Add Income". Fill in the amount, select a category and wallet, then save.',
    },
    {
        id: 'create-wallet',
        question: 'How do I create a new wallet?',
        answer:
            'Go to the Wallets tab and tap "Add Wallet". You can create wallets for cash, bank accounts, mobile money, and savings. Each wallet tracks its own balance independently.',
    },
    {
        id: 'transfer-funds',
        question: 'How do I transfer between wallets?',
        answer:
            'On the dashboard, tap "Transfer" in Quick Actions. Select a source wallet, destination wallet, and the amount. The transfer will debit one wallet and credit the other simultaneously.',
    },
    {
        id: 'set-budget',
        question: 'How do budgets work?',
        answer:
            'Budgets are set per category per month. Go to the dashboard and tap "Create Budget" in the Budget section. You\'ll see a progress bar showing how much of each budget you\'ve used.',
    },
    {
        id: 'backup-data',
        question: 'How do I back up my data?',
        answer:
            'Go to Settings → Backup Data. This creates a JSON file containing all your wallets, transactions, categories, budgets, and settings. You can share or save this file to your device or cloud storage.',
    },
    {
        id: 'restore-data',
        question: 'How do I restore from a backup?',
        answer:
            'Go to Settings → Restore Data. Pick your backup file using the file picker. The app will validate the backup and replace all current data. This action cannot be undone — consider backing up first.',
    },
    {
        id: 'change-currency',
        question: 'How do I change the currency?',
        answer:
            'Go to Settings → Currency. Select from the available currencies. The currency symbol will update across the entire app.',
    },
    {
        id: 'dark-mode',
        question: 'Does the app support dark mode?',
        answer:
            'Yes. Go to Settings → Theme and choose Light, Dark, or System (follows your device setting).',
    },
    {
        id: 'security',
        question: 'How do I protect my data with a PIN?',
        answer:
            'Go to Settings → Security and tap to set up a PIN. You can also enable biometric authentication (fingerprint or face) for quick access. The app will lock automatically when moved to background.',
    },
    {
        id: 'offline',
        question: 'Does the app work offline?',
        answer:
            'Yes. Valto is fully offline-first. All your data is stored locally on your device. No internet connection is required to add transactions, view reports, or manage wallets.',
    },
    {
        id: 'reset-data',
        question: 'How do I reset all data?',
        answer:
            'Go to Settings → Reset All Data. This permanently deletes all wallets, transactions, categories, budgets, and settings. The app will return to its initial state with default seed data. This cannot be undone.',
    },
    {
        id: 'categories',
        question: 'Can I customize categories?',
        answer:
            'Go to Settings → Categories. You can view all expense and income categories. Custom category management will be available in a future update.',
    },
];
