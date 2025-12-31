# 📒 Ledger - Personal Finance Management System

A modern, full-stack personal finance management application built with Next.js, designed to help you track accounts, assets, transactions, and allocations with precision and ease.

[![Next.js](https://img.shields.io/badge/Next.js-16.0.7-black?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.0.1-2D3748?style=flat&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-316192?style=flat&logo=postgresql)](https://www.postgresql.org/)

## ✨ Features

### 💰 Account Management
- **Hierarchical Account Structure** - Create and organize accounts with parent-child relationships
- **Multiple Account Types** - Support for real, nominal, and allocation accounts
- **Account Analytics** - Track balances and transactions across all accounts

### 📈 Asset Tracking
- **Multi-Asset Support** - Track various asset types:
  - 💵 Cash (Rupees)
  - 📊 Mutual Funds (MF)
  - 📈 Exchange-Traded Funds (ETF)
  - 🏢 Shares
  - 🔧 Other custom assets
- **Real-time Price Fetching** - Automatic price updates for market instruments
- **Hierarchical Asset Organization** - Group related assets for better organization

### 💸 Transaction Management
- **Double-Entry Bookkeeping** - Maintain accurate financial records with line-item based transactions
- **Detailed Transaction History** - Track every financial movement with timestamps and descriptions
- **Advanced Filtering** - Search and filter transactions by date, account, asset, and more

### 🤖 AI-Powered Features
- **AI Transaction Creation** - Use natural language to create complex transactions
- **Smart Suggestions** - Get intelligent recommendations for transaction categorization
- **Flexible AI Provider** - Choose between Groq (llama-3.3-70b-versatile) or OpenAI (gpt-4o) models
- **Context Caching** - Efficient Redis-based caching of user context (accounts, assets, patterns) to reduce token usage
- **Token Usage Monitoring** - Real-time visibility into API token consumption for each AI request
- **Optimized Pattern Learning** - One-time pattern curation with 48-hour cache TTL to minimize repeated context sending

### 📊 Allocations & Reporting
- **Portfolio Allocation** - Visualize and manage asset allocation across different categories
- **Real-time Valuations** - See current values based on live market prices
- **Income & Expense Tracking** - Monitor your cash flow with detailed breakdowns

### 🔐 Security & Authentication
- **Secure Authentication** - JWT-based authentication with bcrypt password hashing
- **User Isolation** - Complete data separation between users
- **Session Management** - Cookie-based secure session handling

### 🎨 User Experience
- **Dark Mode Support** - Eye-friendly theme switching with next-themes
- **Responsive Design** - Works seamlessly on desktop and mobile devices
- **Modern UI** - Built with Tailwind CSS for a clean, modern interface

## 🛠️ Technology Stack

### Frontend
- **[Next.js 16](https://nextjs.org/)** - React framework with App Router
- **[React 19](https://react.dev/)** - UI library
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript
- **[Tailwind CSS 4](https://tailwindcss.com/)** - Utility-first CSS framework
- **[next-themes](https://github.com/pacocoursey/next-themes)** - Dark mode support
- **[React DatePicker](https://reactdatepicker.com/)** - Date selection components

### Backend
- **[Prisma 7](https://www.prisma.io/)** - Type-safe ORM
- **[PostgreSQL](https://www.postgresql.org/)** - Primary database
- **[Neon Database](https://neon.tech/)** - Serverless Postgres
- **[Redis](https://redis.io/)** - Caching layer (via ioredis)

### Additional Services
- **AI Models** - Support for both Groq (llama-3.3-70b-versatile) and OpenAI (gpt-4o) for AI-powered transaction processing
- **[Yahoo Finance API](https://github.com/gadicc/node-yahoo-finance2)** - Market data fetching
- **[Axios](https://axios-http.com/)** - HTTP client

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** 20.x or higher
- **pnpm** 10.25.0 or higher (package manager)
- **PostgreSQL** 14.x or higher
- **Redis** (optional, for caching)

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/innajain/ledger.git
cd ledger
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Environment Setup

Create a `.env` file in the root directory with the following variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/ledger"

# Redis (optional)
REDIS_URL="redis://localhost:6379"

# Authentication
JWT_SECRET="your-secure-jwt-secret-key"

# AI Model Configuration
# Choose AI provider: 'groq' (default) or 'openai'
AI_MODEL_PROVIDER="groq"

# API Keys (configure based on your chosen provider)
# For Groq (uses llama-3.3-70b-versatile)
GROQ_API_KEY="your-groq-api-key"

# For OpenAI (uses gpt-4o)
OPENAI_API_KEY="your-openai-api-key"

# Node Environment
NODE_ENV="development"
```

### 4. Database Setup

```bash
# Generate Prisma Client
pnpm prisma generate

# Run database migrations
pnpm prisma migrate dev

# Seed the database (optional, for demo data)
pnpm tsx seed.ts
```

### 5. Start Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## 🏗️ Project Structure

```
ledger/
├── app/                      # Next.js App Router
│   ├── _actions/            # Server Actions
│   ├── _components/         # Shared React components
│   ├── _utils/              # Utility functions
│   ├── accounts/            # Account management pages
│   ├── ai-transaction/      # AI-powered transaction creation
│   ├── allocations/         # Portfolio allocation views
│   ├── api/                 # API routes
│   ├── assets/              # Asset management pages
│   ├── income_expenses/     # Income/Expense tracking
│   ├── login/               # Authentication pages
│   ├── transactions/        # Transaction management
│   └── page.tsx             # Home page
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── migrations/          # Database migrations
├── lib/                     # Shared libraries
├── generated/               # Prisma generated client
├── public/                  # Static assets
├── seed.ts                  # Database seeding script
├── integrity_checker.ts     # Data integrity validation
└── proxy.ts                 # Development proxy configuration
```

## 🔧 Available Scripts

```bash
# Development
pnpm dev              # Start development server

# Building
pnpm build            # Build for production
pnpm start            # Start production server
pnpm analyze          # Analyze bundle size

# Database
pnpm prisma generate  # Generate Prisma Client
pnpm prisma migrate   # Run migrations
pnpm prisma studio    # Open Prisma Studio (database GUI)

# Code Quality
pnpm lint             # Run ESLint
```

## 📊 Database Schema

The application uses a robust double-entry bookkeeping system with the following core models:

- **Users** - Authentication and user management
- **Accounts** - Hierarchical account structure (real, nominal, allocation)
- **Assets** - Various asset types with price tracking
- **Transactions** - Financial transactions with timestamps
- **Line Items** - Individual entries in transactions (linking accounts and assets)

### Key Features of the Schema:
- ✅ Hierarchical structures for accounts and assets
- ✅ Double-entry bookkeeping with line items
- ✅ Support for decimal precision (14,4)
- ✅ Cascade deletion for data integrity
- ✅ Optimized indexes for performance

## 🎯 Usage Examples

### Creating a Transaction

1. Navigate to **Transactions** → **Create New**
2. Enter transaction details (date, description)
3. Add line items with account, asset, and quantity
4. The system automatically maintains double-entry integrity

### AI-Powered Transaction Creation

1. Go to **AI Transaction**
2. Describe your transaction in natural language (e.g., "I spent ₹500 on groceries")
3. The AI will parse and create the transaction with appropriate accounts
4. **View Token Usage** - After parsing, see detailed statistics:
   - Pattern Curation tokens (only used on first request or after cache expiry)
   - Transaction Parsing tokens (used for each request)
   - Context Status indicator (showing if cached data was used)
   - Grand Total token count for cost tracking

**Optimization Benefits:**
- **Reduced Token Usage** - Context (accounts, assets) is cached for 24 hours
- **Faster Response Times** - Cached patterns and context eliminate redundant AI calls
- **Cost Savings** - Pattern curation only runs once every 48 hours
- **Transparency** - Full visibility into token consumption and cache status

### Portfolio Allocation

1. Visit the **Allocations** page
2. View real-time portfolio allocation with current market values
3. Track performance across different asset categories

## 🔒 Security Features

- **Password Hashing** - Bcrypt with salt rounds for secure password storage
- **JWT Authentication** - Secure token-based authentication
- **HTTP-only Cookies** - Protection against XSS attacks
- **User Data Isolation** - Complete separation of user data
- **Data Integrity Checks** - Built-in integrity checker for financial data consistency

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is private and proprietary. All rights reserved.

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/) - The React Framework for the Web
- Powered by [Prisma](https://www.prisma.io/) - Next-generation ORM
- Styled with [Tailwind CSS](https://tailwindcss.com/) - A utility-first CSS framework
- Market data from [Yahoo Finance](https://finance.yahoo.com/)

---

**Made with ❤️ for personal finance management**
