# Cost Estimator User Guide

## Quick Start

The Cost Estimator helps you calculate and compare migration costs before starting your data warehouse migration to Databricks.

## Accessing Cost Estimator

1. Open the DW Migration Assistant app
2. Click on **"Cost Estimator"** in the left sidebar (💰 icon)

## Using Quick Estimate

### Step 1: Enter Migration Parameters

Fill in the following fields:

- **Number of Tables**: Total tables to migrate (e.g., 10)
- **Number of Views**: Total views to migrate (e.g., 5)
- **Number of Stored Procedures**: Total stored procedures (e.g., 3)
- **Total Rows**: Approximate total row count (e.g., 1,000,000)
- **Data Size (GB)**: Total data size in gigabytes (e.g., 50)

### Step 2: Select Configuration

- **Source System**: Choose your current database (Oracle, Snowflake, SQL Server, etc.)
- **LLM Model**: Select the AI model for SQL translation
  - **Llama 4 Maverick**: Most cost-effective, good for simple migrations
  - **Llama 3.3 70B**: Balanced performance and cost
  - **Claude Sonnet 4.5**: High quality, higher cost
  - **Claude Opus 4.1**: Premium quality, highest cost

- **SQL Complexity**:
  - **Low**: Simple queries, basic transformations
  - **Medium**: Moderate complexity with joins and aggregations
  - **High**: Complex queries with nested subqueries, window functions

### Step 3: View Results

Click **"Estimate Costs"** to see:

1. **Total Estimated Cost**: Complete migration cost
2. **Estimated Duration**: Expected migration time in hours
3. **Cost Breakdown**:
   - LLM Translation: AI model costs for SQL conversion
   - Compute (Migration): SQL Warehouse costs during migration
   - Storage (Annual): Delta Lake storage for 1 year
   - Network Transfer: Data transfer costs

4. **Detailed Parameters**: Token usage, warehouse size, etc.

## Using Detailed Comparison

### Additional Parameters

Switch to the **"Detailed Comparison"** tab for advanced analysis:

- **Monthly Compute Hours**: Expected SQL Warehouse usage per month (e.g., 100)
- All the same fields from Quick Estimate

### What You'll See

1. **Monthly Ongoing Costs**:
   - Storage costs per month
   - Compute costs per month
   - Total monthly operational cost

2. **Model Comparison Table**:
   - Cost comparison across all LLM models
   - Recommendations (Most Cost-Effective, Balanced, Premium)
   - Potential savings by choosing different models

3. **Yearly Cost Projection**:
   - Bar chart showing Year 1, 2, and 3 costs
   - Year 1 includes migration + operations
   - Year 2+ only operational costs

4. **3-Year Cost Breakdown**:
   - Pie chart showing cost distribution
   - One-time migration costs vs. ongoing costs
   - Total 3-year TCO (Total Cost of Ownership)

## Understanding Costs

### Cost Components

#### 1. LLM Translation Costs
- **What it is**: AI model fees for converting SQL
- **Factors**: Number of objects, complexity, model chosen
- **Timing**: One-time during migration
- **Optimization**: Choose Llama models for lower costs

#### 2. Compute Costs (Migration)
- **What it is**: SQL Warehouse costs during migration
- **Factors**: Number of objects, complexity
- **Timing**: One-time during migration
- **Duration**: ~30 seconds per object × complexity

#### 3. Storage Costs (Annual)
- **What it is**: Delta Lake storage fees
- **Rate**: $0.023/GB/month
- **Timing**: Ongoing monthly charge
- **Formula**: Data size × $0.023 × 12 months

#### 4. Network Transfer
- **What it is**: Data transfer from source to Databricks
- **Estimate**: ~10% of data size
- **Timing**: One-time during migration
- **Rate**: $0.09/GB

### Example Cost Breakdown

For a migration with:
- 10 tables, 5 views, 3 procedures (18 objects)
- 50 GB data
- Medium complexity
- Llama 4 Maverick model

**Estimated Costs**:
- LLM Translation: ~$0.05
- Compute: ~$0.04
- Storage (Annual): ~$13.80
- Network Transfer: ~$0.45
- **Total: ~$14.34**

**Estimated Duration**: ~0.25 hours (15 minutes)

## Cost Optimization Tips

### 1. Choose the Right Model

| Model | Best For | Cost |
|-------|----------|------|
| Llama 4 Maverick | Simple migrations, tight budgets | Lowest |
| Llama 3.3 70B | Most migrations, good balance | Low |
| Llama 3.1 405B | Complex SQL, better accuracy | Medium |
| Claude Sonnet 4.5 | High-quality output needed | High |
| Claude Opus 4.1 | Mission-critical, complex migrations | Highest |

### 2. Set Complexity Correctly

- Don't overestimate - "Medium" works for most migrations
- Use "Low" for simple CRUD applications
- Reserve "High" for data warehouses with complex analytics

### 3. Plan Storage

- Storage is the largest ongoing cost
- Consider data compression and partitioning
- Archive old data before migration

### 4. Compare Models

Always use the "Detailed Comparison" tab to see:
- How much you can save with different models
- 3-year total cost of ownership
- Break-even points between models

## Embedding in Migration Wizard

When using the **Connect & Migrate** wizard, you can see cost estimates automatically:

1. After connecting to your source system
2. After extracting inventory
3. Before starting the migration

The wizard uses the `MigrationCostPreview` component to show real-time cost estimates based on your extracted metadata.

## API Endpoints

For programmatic access:

```bash
# Estimate migration costs
POST /api/estimate/migration
{
  "num_tables": 10,
  "num_views": 5,
  "num_procedures": 3,
  "data_size_gb": 50,
  "model_id": "databricks-llama-4-maverick",
  "avg_sql_complexity": "medium",
  "source_type": "oracle"
}

# Estimate storage costs
GET /api/estimate/storage?data_size_gb=50&months=12

# Estimate compute costs
GET /api/estimate/compute?warehouse_size=Medium&hours=100

# Compare costs across models
POST /api/estimate/compare
{
  "migration_request": { ... },
  "storage_months": 12,
  "compute_hours_monthly": 100
}
```

## Pricing Disclaimer

All costs are **estimates** based on:
- Current Databricks pricing (as of Nov 2025)
- Assumed usage patterns
- Average complexity factors

**Actual costs may vary** based on:
- Your specific Databricks contract/discounts
- Actual SQL complexity
- Real execution times
- Data compression ratios
- Query optimization effectiveness

Always consult your Databricks account team for precise pricing.

## Frequently Asked Questions

### Q: Are these costs guaranteed?
A: No, these are estimates. Actual costs depend on execution time, data characteristics, and your Databricks pricing tier.

### Q: What's included in the estimate?
A: Migration costs (LLM + compute + network) + first year storage. Ongoing compute costs are separate.

### Q: Can I export the estimate?
A: Currently, take screenshots or copy values. Export feature coming in future release.

### Q: Which model should I choose?
A: For most migrations, **Llama 4 Maverick** or **Llama 3.3 70B** offer the best cost-to-quality ratio.

### Q: How accurate is the duration estimate?
A: Duration is based on 30 seconds per object. Complex objects may take longer. Add 20-30% buffer for safety.

### Q: What if my migration is larger?
A: The estimator scales linearly. For 1000+ objects, consider breaking into batches.

### Q: Are DBU costs for Serverless or Classic?
A: Estimates use SQL Serverless rates ($0.22/DBU). Classic SQL may have different rates.

## Support

For questions or issues with the Cost Estimator:
1. Check this guide
2. Review the implementation docs (`COST_ESTIMATION_IMPLEMENTATION.md`)
3. Contact your Databricks account team for pricing questions
4. File issues in the project repository

---

**Last Updated**: November 26, 2025
**Version**: 1.0.0
