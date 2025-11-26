# Schema Comparison API Reference

## Endpoints

### 1. Compare Schemas

Compare source and target schemas to identify differences.

**Endpoint**: `POST /api/compare/schemas`

**Request Body**:
```json
{
  "source_connection_id": "uuid-string",
  "source_catalog": "optional-catalog-name",
  "source_schema": "optional-schema-name",
  "target_catalog": "databricks-catalog",
  "target_schema": "databricks-schema"
}
```

**Response**:
```json
{
  "success": true,
  "source_info": {
    "type": "oracle",
    "host": "db.example.com",
    "database": "proddb",
    "schema": "hr"
  },
  "target_info": {
    "catalog": "main",
    "schema": "hr_migrated"
  },
  "tables_only_in_source": ["employees", "departments"],
  "tables_only_in_target": ["temp_table"],
  "tables_in_both": [
    {
      "table_name": "users",
      "status": "match",
      "column_differences": [],
      "source_column_count": 10,
      "target_column_count": 10
    },
    {
      "table_name": "orders",
      "status": "different",
      "column_differences": [
        {
          "column_name": "order_date",
          "difference_type": "type_mismatch",
          "source_type": "DATE",
          "target_type": "TIMESTAMP",
          "source_nullable": true,
          "target_nullable": true
        }
      ],
      "source_column_count": 8,
      "target_column_count": 8
    }
  ],
  "summary": {
    "total_source_tables": 4,
    "total_target_tables": 3,
    "tables_to_create": 2,
    "orphaned_tables": 1,
    "matching_tables": 1,
    "tables_with_differences": 1
  }
}
```

**Status Values**:
- `match`: Table structure matches
- `different`: Table has column differences
- `missing_in_target`: Table only exists in source
- `missing_in_source`: Table only exists in target

**Difference Types**:
- `missing_in_target`: Column needs to be added to target
- `missing_in_source`: Column exists only in target
- `type_mismatch`: Data types differ
- `nullability_mismatch`: Nullable constraints differ

---

### 2. Compare Table Structures

Compare specific table structures between source and target.

**Endpoint**: `POST /api/compare/tables/{table_name}`

**Path Parameter**:
- `table_name`: Name of the table to compare

**Request Body**:
```json
{
  "source_connection_id": "uuid-string",
  "source_catalog": "optional-catalog",
  "source_schema": "hr",
  "source_table": "employees",
  "target_catalog": "main",
  "target_schema": "hr_migrated",
  "target_table": "employees"
}
```

**Response**:
```json
{
  "success": true,
  "table_name": "employees",
  "exists_in_target": true,
  "source_columns": [
    {
      "name": "employee_id",
      "type": "NUMBER",
      "nullable": false,
      "primary_key": true
    },
    {
      "name": "first_name",
      "type": "VARCHAR2",
      "nullable": true,
      "primary_key": false
    },
    {
      "name": "hire_date",
      "type": "DATE",
      "nullable": true,
      "primary_key": false
    }
  ],
  "target_columns": [
    {
      "name": "employee_id",
      "type": "INT",
      "nullable": true,
      "comment": null
    },
    {
      "name": "first_name",
      "type": "STRING",
      "nullable": true,
      "comment": null
    },
    {
      "name": "hire_date",
      "type": "DATE",
      "nullable": true,
      "comment": null
    }
  ],
  "column_differences": [
    {
      "column_name": "employee_id",
      "difference_type": "type_mismatch",
      "source_type": "NUMBER",
      "target_type": "INT",
      "source_nullable": false,
      "target_nullable": true
    }
  ],
  "index_differences": {
    "source_indexes": ["idx_employee_name"],
    "target_indexes": []
  },
  "primary_key_differences": {
    "source_primary_keys": ["employee_id"],
    "target_primary_keys": []
  },
  "foreign_key_differences": {
    "source_foreign_keys": [],
    "target_foreign_keys": []
  }
}
```

**If Table Doesn't Exist in Target**:
```json
{
  "success": true,
  "table_name": "employees",
  "exists_in_target": false,
  "source_columns": [...],
  "target_columns": [],
  "differences": [
    {
      "type": "missing_table",
      "message": "Table does not exist in target"
    }
  ]
}
```

---

### 3. Get Data Type Mappings

Get data type mapping rules for a specific source system.

**Endpoint**: `GET /api/compare/data-types`

**Query Parameters**:
- `source_system`: Source database type (oracle, snowflake, sqlserver, teradata, mysql)

**Example Request**:
```
GET /api/compare/data-types?source_system=oracle
```

**Response**:
```json
{
  "source_system": "oracle",
  "mappings": [
    {
      "source": "NUMBER",
      "target": "DECIMAL",
      "notes": "Precision preserved"
    },
    {
      "source": "NUMBER(p,s)",
      "target": "DECIMAL(p,s)",
      "notes": "Exact mapping"
    },
    {
      "source": "VARCHAR2",
      "target": "STRING",
      "notes": "No length limit in Databricks"
    },
    {
      "source": "DATE",
      "target": "DATE",
      "notes": "Direct mapping"
    },
    {
      "source": "TIMESTAMP",
      "target": "TIMESTAMP",
      "notes": "Direct mapping"
    },
    {
      "source": "CLOB",
      "target": "STRING",
      "notes": "Large text"
    },
    {
      "source": "BLOB",
      "target": "BINARY",
      "notes": "Binary data"
    }
  ]
}
```

**Supported Source Systems**:
- `oracle`: Oracle Database
- `snowflake`: Snowflake
- `sqlserver`: Microsoft SQL Server
- `teradata`: Teradata
- `mysql`: MySQL

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

**Common Error Scenarios**:
- Connection not found: `source_connection_id` doesn't exist
- Invalid identifier: Catalog/schema/table name contains invalid characters
- Database error: Failed to query source or target database
- Permission error: User lacks access to specified resources

---

## SQL Safety

All endpoints use SQL injection prevention:

1. **validate_identifier()**: Validates identifier names
   - Only alphanumeric, underscore, and hyphen allowed
   - Maximum 255 characters
   - Raises HTTPException(400) for invalid names

2. **quote_identifier()**: Safely quotes identifiers
   - Wraps identifiers in backticks
   - Calls validate_identifier() first
   - Returns properly escaped identifier

**Example**:
```python
# Safe
safe_catalog = quote_identifier(request.target_catalog)
cursor.execute(f"SHOW TABLES IN {safe_catalog}.{safe_schema}")

# Unsafe (never do this)
cursor.execute(f"SHOW TABLES IN {request.target_catalog}")
```

---

## Frontend Integration

### API Client Methods

```typescript
// databricksService.ts

// Compare schemas
static async compareSchemas(request: {
  source_connection_id: string;
  source_catalog?: string;
  source_schema?: string;
  target_catalog: string;
  target_schema: string;
}): Promise<SchemaComparisonResponse>

// Compare table structure
static async compareTableStructure(request: {
  source_connection_id: string;
  source_catalog?: string;
  source_schema: string;
  source_table: string;
  target_catalog: string;
  target_schema: string;
  target_table: string;
}): Promise<TableComparisonResponse>

// Get data type mappings
static async getDataTypeMappings(
  sourceSystem: string
): Promise<DataTypeMappingResponse>
```

### Usage Example

```typescript
// Compare schemas
const result = await DatabricksService.compareSchemas({
  source_connection_id: connectionId,
  source_schema: 'hr',
  target_catalog: 'main',
  target_schema: 'hr_migrated'
});

if (result.success) {
  console.log('Tables to create:', result.tables_only_in_source);
  console.log('Summary:', result.summary);
}

// Get data type mappings
const mappings = await DatabricksService.getDataTypeMappings('oracle');
console.log('Mappings:', mappings.mappings);
```

---

## Testing with cURL

### Compare Schemas
```bash
curl -X POST http://localhost:8000/api/compare/schemas \
  -H "Content-Type: application/json" \
  -d '{
    "source_connection_id": "abc-123",
    "target_catalog": "main",
    "target_schema": "test"
  }'
```

### Compare Table
```bash
curl -X POST http://localhost:8000/api/compare/tables/employees \
  -H "Content-Type: application/json" \
  -d '{
    "source_connection_id": "abc-123",
    "source_schema": "hr",
    "source_table": "employees",
    "target_catalog": "main",
    "target_schema": "hr",
    "target_table": "employees"
  }'
```

### Get Data Type Mappings
```bash
curl http://localhost:8000/api/compare/data-types?source_system=oracle
```

---

## Performance Considerations

1. **Schema Comparison**: O(n) where n = total tables in both schemas
2. **Table Comparison**: O(m) where m = columns in table
3. **Caching**: Consider caching results for repeated comparisons
4. **Pagination**: For large schemas (1000+ tables), consider pagination
5. **Async Processing**: For very large schemas, consider background jobs

---

## Security Considerations

1. **Authentication**: All endpoints require valid Databricks credentials
2. **Authorization**: Users can only compare schemas they have access to
3. **SQL Injection**: Prevented via validate_identifier() and quote_identifier()
4. **Rate Limiting**: Consider implementing rate limits for production
5. **Logging**: All comparisons should be logged for audit trail
