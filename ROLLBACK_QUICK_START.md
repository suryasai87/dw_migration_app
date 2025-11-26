# Rollback Quick Start Guide

## Quick Overview
The Rollback Manager allows you to create snapshots of your database schema before migrations and restore to previous states if needed.

## How to Access
Navigate to **Rollback Manager** in the sidebar (Restore icon).

## Creating a Snapshot

### Step 1: Click "Create Snapshot"
Located in the top-right corner of the Rollback Manager page.

### Step 2: Fill in Details
- **Catalog:** Target catalog (e.g., `main`)
- **Schema:** Target schema (e.g., `default`)
- **Description:** Descriptive name (e.g., "Before Oracle migration - Jan 15 2024")
- **Include Data Snapshot:** Check if you want to use Delta Lake time travel (optional)

### Step 3: Create
Click "Create Snapshot" button. You'll see a success message with the number of objects captured.

## Viewing Changes

### Step 1: Find Your Snapshot
Locate the snapshot in the list.

### Step 2: Click "View Diff" Icon
The Compare Arrows icon (⇆) opens the diff viewer.

### Step 3: Review Changes
View tabs for:
- **Created:** New objects added after snapshot
- **Modified:** Objects with structure changes
- **Deleted:** Objects removed after snapshot
- **Unchanged:** Objects with no changes

## Rolling Back

### Step 1: Click "Rollback" Icon
The Restore icon (↶) on the snapshot you want to restore.

### Step 2: Review Validation
Automatic validation shows:
- Affected objects count
- Warnings (e.g., dependent views)
- Errors (if rollback cannot proceed)

### Step 3: Dry Run (Recommended)
Click "Dry Run" to test without making changes. Review the results.

### Step 4: Confirm Rollback
1. Check the confirmation box
2. Click "Confirm Rollback"
3. Wait for completion

## API Endpoints Reference

### Create Snapshot
```bash
POST /api/rollback/snapshot
Content-Type: application/json

{
  "catalog": "main",
  "schema_name": "default",
  "description": "Before migration",
  "include_data": false,
  "auto_snapshot": false
}
```

### List Snapshots
```bash
GET /api/rollback/snapshots
```

### View Diff
```bash
GET /api/rollback/diff/{snapshot_id}
```

### Validate Rollback
```bash
POST /api/rollback/validate
Content-Type: application/json

{
  "snapshot_id": "uuid",
  "catalog": "main",
  "schema_name": "default"
}
```

### Restore Snapshot
```bash
POST /api/rollback/restore/{snapshot_id}
Content-Type: application/json

{
  "snapshot_id": "uuid",
  "catalog": "main",
  "schema_name": "default",
  "drop_existing": true,
  "restore_data": false,
  "dry_run": true
}
```

### Delete Snapshot
```bash
DELETE /api/rollback/snapshot/{snapshot_id}
```

## Best Practices

### Before Migration
1. Create a snapshot with a descriptive name
2. Note the snapshot ID or description for later reference
3. Proceed with migration

### After Migration
1. Review changes using "View Diff"
2. If everything looks good, delete the old snapshot after confirming the migration
3. If issues found, use rollback

### Before Rollback
1. Always validate first (automatic in UI)
2. Always do a dry run
3. Review the dry run results carefully
4. Check the confirmation box and confirm

## Safety Features

### Validation Checks
- Dependent views detection
- Object impact analysis
- Warning/error categorization
- Blocked rollback if critical errors

### Dry Run
- Tests rollback without making changes
- Shows exactly what will happen
- Reports success/failure for each object

### Confirmation Required
- Must check confirmation box
- Clear warning about data loss
- Explains what will happen

## Common Use Cases

### 1. Test Migration in Dev
```
1. Create snapshot: "Before test migration"
2. Run migration
3. Test results
4. If issues: Rollback to snapshot
5. If good: Delete snapshot and proceed to prod
```

### 2. Production Migration with Safety Net
```
1. Create snapshot: "PROD - Before Oracle migration - [date]"
2. Enable "Include Data Snapshot" for critical tables
3. Run migration
4. Monitor for 24 hours
5. If issues: Rollback
6. If stable: Keep snapshot for 7 days, then delete
```

### 3. Schema Experimentation
```
1. Create snapshot: "Before experiment"
2. Try different schema designs
3. View diff to see changes
4. Keep what works or rollback to try again
```

## Troubleshooting

### "Snapshot not found"
- Snapshot may have been deleted
- Check the snapshots list
- Create a new snapshot if needed

### "Validation failed with errors"
- Review the error messages
- Fix the blocking issues
- Run validation again

### "Rollback completed with failures"
- Check the results for specific errors
- May need manual intervention for failed objects
- Review error messages for details

### "Cannot include data snapshot"
- Tables must be Delta Lake format
- Check if tables support time travel
- You can still create DDL-only snapshot

## Tips

1. **Use descriptive names:** Include date, purpose, and environment
2. **Regular cleanup:** Delete old snapshots you no longer need
3. **Test first:** Always use dry run before actual rollback
4. **Document:** Note which snapshot was used before major migrations
5. **Communicate:** Let team know before performing rollback
6. **Verify:** After rollback, verify objects are as expected

## What Gets Snapshotted

### Included
- Table DDL (structure)
- View DDL (definition)
- Delta Lake versions (if "Include Data" checked)

### Not Included
- Stored procedures
- Functions
- Triggers
- Permissions/Grants
- Statistics
- Indexes (they're in DDL)

## Need Help?

Check the "About Rollback" tab in the Rollback Manager for:
- Feature overview
- Best practices
- Usage guidelines
- Additional documentation
