# Database Evaluation: PostgreSQL vs MongoDB for Ledger Application

## Executive Summary

**Recommendation: PostgreSQL (Current Choice) ✅**

After thorough analysis of the Ledger application's requirements, data model, and use cases, **PostgreSQL is the optimal database choice** and should remain as the primary database. This document explains why.

---

## Application Overview

The Ledger application is a personal finance management system implementing:
- **Double-entry bookkeeping** system
- **Hierarchical account and asset structures**
- **Complex financial transactions** with line items
- **ACID compliance requirements** for financial data integrity
- **Relational data** with strong consistency needs
- **Decimal precision** for financial calculations

---

## Key Requirements Analysis

### 1. Data Model Requirements

#### Relational Structure
The application has a highly **relational data model**:

```
User (1) ─┬─> (N) Accounts ──> Self-referential hierarchy
          ├─> (N) Assets ────> Self-referential hierarchy  
          └─> (N) Transactions ──> (N) Line Items ──┬─> Account (FK)
                                                      └─> Asset (FK)
```

**PostgreSQL Advantage**: ✅
- Native support for foreign keys with referential integrity
- Efficient JOIN operations across related tables
- Cascade deletes maintain data consistency
- Self-referential relationships for hierarchies work seamlessly

**MongoDB Limitation**: ❌
- No foreign key constraints
- Manual referential integrity enforcement in application code
- JOIN operations (via `$lookup`) are slower and less efficient
- Requires denormalization or complex application logic

### 2. ACID Compliance

The application requires **strict ACID guarantees**:
- **Atomicity**: All line items in a transaction must succeed or fail together
- **Consistency**: Financial invariants must be maintained (e.g., debits = credits)
- **Isolation**: Concurrent transactions must not corrupt data
- **Durability**: Committed transactions must survive failures

**PostgreSQL Advantage**: ✅
- Full ACID compliance out of the box
- Mature transaction management
- Row-level locking prevents race conditions
- Multi-version concurrency control (MVCC)

**MongoDB Limitation**: ⚠️
- ACID transactions added in v4.0 but with limitations
- Multi-document transactions have performance overhead
- Less mature than PostgreSQL's 30+ years of ACID support

### 3. Data Integrity Constraints

The application enforces complex business rules:

```typescript
// From transactions.ts - Financial invariants
// 1. Per-asset quantities must balance across account types
// 2. Sum of values must equal zero across all line items
// 3. Book values required for non-rupee assets
// 4. No cycles in hierarchical structures
```

**PostgreSQL Advantage**: ✅
- Check constraints
- Unique constraints with composite keys
- NOT NULL enforcement
- Triggers for complex validation
- Database-level enforcement reduces bugs

**MongoDB Limitation**: ❌
- Schema validation is less powerful
- Requires application-level enforcement
- Higher risk of data inconsistency
- More complex application code

### 4. Query Patterns

The application performs:
- Complex JOINs across accounts, assets, transactions, and line items
- Aggregations by account type and asset type
- Hierarchical queries (walking parent-child relationships)
- Financial calculations with decimal precision

**PostgreSQL Advantage**: ✅
- Optimized JOIN algorithms
- Recursive CTEs for hierarchy traversal
- Efficient indexing on foreign keys
- DECIMAL type with exact precision (14,4)
- Query optimizer handles complex queries

**MongoDB Limitation**: ❌
- $lookup is less efficient than SQL JOINs
- No recursive queries (requires multiple roundtrips)
- Decimal128 less efficient than native DECIMAL
- Aggregation pipeline more verbose

### 5. Schema Evolution

The application uses **Prisma ORM with migrations**:

```bash
pnpm prisma migrate dev  # Create and apply migrations
```

**PostgreSQL Advantage**: ✅
- Prisma has excellent PostgreSQL support
- Schema migrations are transactional
- Can add/modify columns without downtime (with careful planning)
- Strong typing with Prisma Client

**MongoDB with Prisma**: ⚠️
- Prisma MongoDB support is less mature
- No schema enforcement at database level
- Migration complexity increases

---

## Specific Use Case Analysis

### Double-Entry Bookkeeping

The core business logic enforces double-entry accounting:

```typescript
// From transactions.ts lines 90-110
// Check invariant: per-asset quantities equal between 
// real, allocation, and nominal accounts
if (!real_qty.equals(alloc_qty) || !real_qty.equals(nominal_qty)) {
  throw new Error('quantity mismatch...');
}
```

**Why PostgreSQL Wins**:
1. **Transaction guarantees**: All line items succeed or fail atomically
2. **Constraint checking**: Database validates invariants
3. **Isolation levels**: Prevents concurrent transaction conflicts
4. **Rollback support**: Easy to undo failed transactions

**MongoDB Issues**:
- Multi-document transactions required (performance hit)
- Application must handle all validation
- Race conditions more likely without proper locking

### Hierarchical Data (Accounts & Assets)

Both accounts and assets use self-referential hierarchies:

```prisma
model account {
  parent_id String?
  parent    account?  @relation("AccountHierarchy", fields: [parent_id], references: [id])
  children  account[] @relation("AccountHierarchy")
}
```

**Why PostgreSQL Works**:
1. **Foreign key constraints**: Prevents orphaned nodes
2. **Recursive CTEs**: Efficient hierarchy traversal
3. **Cycle detection**: Application validates, DB enforces structure
4. **Simple updates**: Parent changes are straightforward

**MongoDB Alternative**:
- Could use nested documents or adjacency list
- No referential integrity
- Complex queries for deep hierarchies
- Manual cycle detection always required

### Financial Calculations

The application uses `Decimal(14,4)` for precision:

```prisma
quantity   Decimal  @db.Decimal(14, 4)
book_value Decimal? @db.Decimal(14, 4)
```

**Why PostgreSQL is Better**:
1. **Native DECIMAL**: Exact precision, no floating-point errors
2. **Efficient arithmetic**: Hardware-accelerated operations
3. **Index support**: Can index decimal columns efficiently
4. **Aggregations**: SUM, AVG work correctly

**MongoDB Decimal128**:
- Less efficient storage
- Less efficient operations
- Fewer native functions

---

## Performance Considerations

### Current Data Scale
- Personal finance application (single-user per instance)
- Typical data volume: Thousands of transactions per user
- Dozens to hundreds of accounts/assets per user

### PostgreSQL Performance
✅ **More than sufficient** for this use case:
- Can handle millions of rows with proper indexing
- Existing indexes on user_id, transaction_id, account_id, asset_id
- Query performance is excellent at this scale
- Neon Database provides serverless PostgreSQL with good scaling

### Would MongoDB Be Faster?
❌ **No, not for this use case**:
- MongoDB excels at: Document storage, schema flexibility, horizontal scaling
- This app needs: Relational integrity, ACID transactions, complex JOINs
- The relational nature means MongoDB would require:
  - Multiple queries instead of JOINs
  - Application-level integrity checking
  - More complex code
  - **Overall slower performance**

---

## Other Database Alternatives Considered

### MySQL/MariaDB
**Verdict**: ⚠️ PostgreSQL is better

Pros:
- Also relational with ACID support
- Good Prisma support

Cons:
- Less feature-rich than PostgreSQL
- Weaker support for JSON, arrays, and advanced types
- Less powerful query optimizer
- PostgreSQL has better standard compliance

### SQLite
**Verdict**: ❌ Not suitable

Pros:
- Simple, embedded database
- Good for development

Cons:
- Not suitable for web applications (file-based locking)
- No concurrent write support
- Limited scalability
- No network access

### CockroachDB/YugabyteDB (Distributed PostgreSQL)
**Verdict**: ⚠️ Overkill for now

Pros:
- PostgreSQL-compatible
- Horizontal scalability
- Global distribution

Cons:
- Much more complex to operate
- Higher cost
- Unnecessary for single-user personal finance app
- Can migrate later if needed

---

## Migration Considerations

### If You Switched to MongoDB

**Effort Required**: 🔴 **HIGH**

1. **Schema Redesign** (1-2 weeks)
   - Denormalize for performance
   - Decide on embedding vs referencing
   - Design for MongoDB query patterns

2. **Code Rewrite** (2-4 weeks)
   - Rewrite all Prisma queries
   - Implement referential integrity in code
   - Rewrite transaction logic
   - Add validation layers
   - Update integrity checker

3. **Testing** (1-2 weeks)
   - Test all financial calculations
   - Verify data consistency
   - Test concurrent access
   - Validate migrations

4. **Data Migration** (1 week)
   - Export from PostgreSQL
   - Transform to MongoDB format
   - Import and verify
   - Test with production data

**Total Effort**: ~5-9 weeks

**Risk**: 🔴 **HIGH** - Financial data corruption risk

**Benefit**: ❌ **NONE** - No performance or feature gains

---

## Cost Analysis

### PostgreSQL (Neon Database)
- **Current**: ~$10-50/month for typical usage
- **Serverless**: Pay for what you use
- **Scaling**: Can handle 10-100x growth without changes

### MongoDB Atlas
- **Estimated**: ~$25-100/month for comparable performance
- **Overhead**: Additional application complexity
- **Hidden costs**: Developer time for maintenance

**Winner**: ✅ PostgreSQL (better value)

---

## Conclusion

### Final Recommendation: Keep PostgreSQL

**Reasoning**:

1. ✅ **Perfect fit** for relational financial data
2. ✅ **ACID guarantees** essential for financial integrity
3. ✅ **Foreign keys** maintain referential integrity
4. ✅ **Mature ecosystem** with Prisma ORM
5. ✅ **No performance issues** at current or expected scale
6. ✅ **Lower risk** - no migration needed
7. ✅ **Better cost** - both in infrastructure and development time

**When to Reconsider**:

You should only consider changing databases if:
- ❌ You need to scale horizontally to millions of users (not the case)
- ❌ You need flexible schema for rapidly changing requirements (financial data is stable)
- ❌ You primarily store unstructured documents (you store structured transactions)
- ❌ You need geo-distribution (single-region is fine)

**None of these apply to your use case.**

---

## Recommendations for Current Setup

To optimize your existing PostgreSQL setup:

### 1. Ensure Proper Indexing ✅ (Already Done)
```prisma
@@index([user_id, type])     // account
@@index([transaction_id])     // line_item  
@@index([datetime])          // transaction
```

### 2. Consider Connection Pooling
If not already using it, consider PgBouncer for better connection management.

### 3. Regular VACUUM
Ensure autovacuum is running to maintain performance.

### 4. Monitoring
Set up monitoring for:
- Query performance
- Connection pool usage
- Database size growth
- Slow query log

### 5. Backup Strategy ✅ (Already Implemented)
Your GitHub Actions backup workflow is excellent - keep it running.

---

## Summary Table

| Factor | PostgreSQL | MongoDB | Winner |
|--------|-----------|---------|--------|
| Data Model Fit | ✅ Excellent | ❌ Poor | PostgreSQL |
| ACID Compliance | ✅ Full | ⚠️ Limited | PostgreSQL |
| Referential Integrity | ✅ Native | ❌ Manual | PostgreSQL |
| Query Performance | ✅ Excellent | ❌ Worse | PostgreSQL |
| Decimal Precision | ✅ Native | ⚠️ Decimal128 | PostgreSQL |
| Prisma Support | ✅ Excellent | ⚠️ Limited | PostgreSQL |
| Transaction Support | ✅ Mature | ⚠️ New | PostgreSQL |
| Development Speed | ✅ Fast | ❌ Slower | PostgreSQL |
| Maintenance Burden | ✅ Low | ❌ Higher | PostgreSQL |
| Cost | ✅ Lower | ❌ Higher | PostgreSQL |
| **OVERALL** | **✅ WINNER** | ❌ Not Suitable | **PostgreSQL** |

---

## References

1. [Prisma Documentation](https://www.prisma.io/docs)
2. [PostgreSQL ACID Compliance](https://www.postgresql.org/docs/current/transaction-iso.html)
3. [MongoDB Transactions](https://www.mongodb.com/docs/manual/core/transactions/)
4. [Neon Database](https://neon.tech/docs/introduction)

---

**Author**: GitHub Copilot AI  
**Date**: 2026-01-10  
**Version**: 1.0
