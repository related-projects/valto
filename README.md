# Valto 💰

**Offline-first personal finance & budget tracking app**

Valto is a **mobile-first, offline budget and expense tracking application** built with **React Native** and designed to work **entirely without external APIs**.
All data is stored locally on the device, making Valto fast, private, and reliable even without internet access.

---

## ✨ Features

### Core (Implemented)

* ✅ Offline-first architecture (no API required)
* ✅ Wallet management (multiple wallets)
* ✅ Expense & income transactions
* ✅ Category-based tracking (expense & income)
* ✅ Automatic wallet balance updates
* ✅ Seeded default data on first launch
* ✅ Clean Architecture with clear separation of concerns
* ✅ Type-safe domain models
* ✅ Hooks-based data access

### Dashboard

* Monthly budget overview
* Spending by category
* Wallet summary

> ⚠️ Charts and dashboard values are backed by real local data (no mock APIs).

---

## 🧱 Architecture

Valto follows **Clean Architecture** with a **feature-based structure**.

```
src/
├── core/
│   ├── di/                 # Dependency injection
│   ├── storage/            # Local storage adapters
│
├── domain/
│   ├── entities/           # Business models (Transaction, Wallet, Category)
│   ├── repositories/       # Repository interfaces
│
├── data/
│   ├── repositories/       # Repository implementations
│   ├── seed/               # Seed initialization logic
│
├── features/
│   ├── transactions/
│   ├── wallets/
│   ├── categories/
│
├── hooks/
│   ├── useTransactions.ts
│   ├── useWallets.ts
│   ├── useCategories.ts
│
└── app/
    ├── _layout.tsx         # App entry & seed initialization
    └── (tabs)/             # Navigation structure
```

### Why Clean Architecture?

* Easy to scale (budgets, goals, exports later)
* Testable business logic
* UI remains independent from storage details
* Perfect for offline-first apps

---

## 📱 Tech Stack

* **React Native**
* **Expo Router**
* **TypeScript**
* **AsyncStorage / local persistence**
* **UUID (with React Native polyfill)**
* **Antigravity IDE**
* **Lovable (UI design)**

---

## 🔌 Offline-First Philosophy

Valto:

* ❌ No backend
* ❌ No APIs
* ❌ No internet dependency
* ✅ Local persistence
* ✅ Deterministic behavior
* ✅ Full privacy

All business logic and data live on the device.

---

## 🌱 Seed Data

On first launch, Valto automatically initializes:

### Default Wallet

* Savings

### Default Categories

**Expenses**

* Food
* Transport
* Rent
* Utilities
* Entertainment
* Health

**Income**

* Salary
* Freelance
* Gifts
* Other

Seed initialization:

* Runs once
* Is idempotent (safe on restart)
* Uses repositories (no direct storage access)
* Uses UUIDs with proper React Native polyfill

---

## 🚀 Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the app

```bash
npx expo start
```

### 3. Run on device/emulator

* iOS Simulator
* Android Emulator
* Physical device (Expo Go)

---

## 🧪 Development Notes

* Seed logic runs in `app/_layout.tsx`
* UI is **presentational only**
* Data access must go through hooks & repositories
* No direct storage access from screens or modals
* UUIDs require `react-native-get-random-values` polyfill

---

## 🗺️ Roadmap

### Phase 2 (Next)

* Budgets per category
* Monthly budget enforcement
* Empty state improvements

### Phase 3

* Recurring transactions
* Financial insights
* Local data export (CSV / JSON)

### Phase 4

* App lock / biometric protection
* Themes & customization

---

## 🧠 Design

* Designed with **Lovable**
* Implemented with **Antigravity IDE**
* Mobile-first UX
* Neutral & elegant color palette:

  * Ash gray
  * Dark brown

---

## 📄 License

This project is for **personal, educational, and experimental purposes**.
All rights reserved.