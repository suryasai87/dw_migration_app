# Quick Start Guide: Real-Time Migration Progress Tracking

## Overview
This guide shows you how to use the new real-time migration progress tracking feature in the DW Migration Assistant.

## For End Users

### Starting a Migration with Progress Tracking

1. **Navigate to Connect & Migrate**
   - Go to the "Connect & Migrate" page
   - Complete steps 1-3 (Connect, Extract Inventory, Configure)

2. **Run Migration**
   - Click "Run Migration" or "Run Dry Run"
   - You'll immediately see the migration progress tracker appear

3. **Monitor Progress**
   - **Progress Bar**: Shows overall completion percentage
   - **Statistics**: Real-time counts of completed, failed, and total objects
   - **ETA**: Estimated time remaining (calculated based on average processing time)
   - **Current Object**: Shows which table/view/procedure is being processed right now
   - **Live Logs**: Scrolling log viewer with color-coded entries
     - Blue = Info
     - Orange = Warning
     - Red = Error
   - **Object Results Table**: Detailed status of each migrated object

4. **Cancel if Needed**
   - Click the "Cancel" button to stop the migration
   - Already completed objects remain processed
   - Migration status will show as "Cancelled"

5. **Completion**
   - When migration finishes, status shows "Completed", "Failed", or "Cancelled"
   - Review the results table for any errors
   - Check logs for detailed information

## For Developers

### Using the MigrationProgress Component

```tsx
import MigrationProgress from './components/MigrationProgress';

function MyComponent() {
  const [jobId, setJobId] = useState<string | null>(null);

  const handleStart = async () => {
    const result = await DatabricksService.startMigration({
      inventory_path: '/path/to/inventory',
      target_catalog: 'main',
      target_schema: 'migrated',
      source_type: 'oracle',
      model_id: 'databricks-llama-4-maverick',
      dry_run: true
    });

    if (result.success) {
      setJobId(result.job_id);
    }
  };

  const handleComplete = (success: boolean) => {
    console.log('Migration completed:', success);
    // Handle completion (show summary, reset state, etc.)
  };

  const handleCancel = () => {
    console.log('Migration cancelled');
    // Handle cancellation
  };

  return (
    <>
      <button onClick={handleStart}>Start Migration</button>
      {jobId && (
        <MigrationProgress
          jobId={jobId}
          onComplete={handleComplete}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
```

### API Usage Examples

#### 1. Start a Migration
```typescript
const result = await DatabricksService.startMigration({
  inventory_path: '/Volumes/catalog/schema/volume/inventory',
  target_catalog: 'main',
  target_schema: 'migrated_schema',
  source_type: 'oracle',
  model_id: 'databricks-llama-4-maverick',
  dry_run: false
});

console.log(result);
// {
//   success: true,
//   job_id: "uuid-here",
//   total_objects: 150,
//   message: "Migration job started successfully"
// }
```

#### 2. Get Current Progress (One-time)
```typescript
const progress = await DatabricksService.getMigrationProgress(jobId);

console.log(progress);
// {
//   job_id: "...",
//   status: "running",
//   progress_percentage: 45,
//   total_objects: 150,
//   completed_objects: 67,
//   failed_objects: 1,
//   current_object: "public.customers",
//   estimated_time_remaining: 120,
//   logs: [...],
//   object_results: [...]
// }
```

#### 3. Cancel a Migration
```typescript
const result = await DatabricksService.cancelMigration(jobId);

console.log(result);
// {
//   success: true,
//   message: "Migration job cancelled"
// }
```

#### 4. List All Jobs
```typescript
const jobs = await DatabricksService.listMigrationJobs();

console.log(jobs);
// {
//   jobs: [
//     {
//       job_id: "...",
//       status: "completed",
//       progress_percentage: 100,
//       total_objects: 150,
//       completed_objects: 148,
//       failed_objects: 2,
//       log_count: 452,
//       result_count: 150
//     },
//     ...
//   ]
// }
```

### Manual SSE Connection (Advanced)

If you need to build a custom UI, you can connect directly to the SSE endpoint:

```typescript
const eventSource = new EventSource(`/api/migrate/stream/${jobId}`);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  console.log('Status:', data.status);
  console.log('Progress:', data.progress_percentage + '%');
  console.log('New logs:', data.new_logs);
  console.log('New results:', data.new_results);

  if (data.complete) {
    eventSource.close();
    console.log('Migration completed!');
  }
};

eventSource.onerror = (error) => {
  console.error('SSE error:', error);
  eventSource.close();
};

// Clean up on component unmount
return () => {
  eventSource.close();
};
```

### Backend Integration

If you need to create a custom migration workflow:

```python
from migration_progress import (
    get_migration_lock, initialize_migration_job,
    update_migration_progress, add_migration_log,
    add_object_result, complete_migration_job
)

async def my_custom_migration(job_id: str, objects: List[dict]):
    lock = get_migration_lock(job_id, migration_locks)

    # Initialize job
    async with lock:
        initialize_migration_job(
            job_id, migration_jobs, len(objects),
            "oracle", "main", "migrated"
        )
        add_migration_log(job_id, migration_jobs, "info",
                         "Starting custom migration")

    # Process objects
    for idx, obj in enumerate(objects):
        # Check for cancellation
        async with lock:
            if migration_jobs[job_id]["status"] == "cancelled":
                return

        # Update current object
        async with lock:
            update_migration_progress(job_id, migration_jobs,
                                     current_object=obj["name"])
            add_migration_log(job_id, migration_jobs, "info",
                            f"Processing {obj['name']}")

        # Do the work
        try:
            result = await process_object(obj)

            async with lock:
                update_migration_progress(
                    job_id, migration_jobs,
                    completed_objects=migration_jobs[job_id]["completed_objects"] + 1
                )
                add_object_result(job_id, migration_jobs,
                                 obj["name"], obj["type"], "success")
        except Exception as e:
            async with lock:
                update_migration_progress(
                    job_id, migration_jobs,
                    failed_objects=migration_jobs[job_id]["failed_objects"] + 1
                )
                add_object_result(job_id, migration_jobs,
                                 obj["name"], obj["type"], "error",
                                 error=str(e))

    # Complete job
    async with lock:
        complete_migration_job(job_id, migration_jobs, "completed")
        add_migration_log(job_id, migration_jobs, "info",
                         "Migration completed")
```

## Architecture Overview

```
┌─────────────────┐
│   Frontend      │
│  ConnectAndMigrate
│                 │
│  [Start Migration] ──────────┐
└─────────────────┘            │
                               │
                               ▼
                    ┌──────────────────┐
                    │   Backend API    │
                    │ POST /migrate/start
                    │                  │
                    │  Returns job_id  │
                    └──────────────────┘
                               │
                               │ Spawns background task
                               ▼
┌─────────────────┐   ┌──────────────────┐
│ MigrationProgress│   │  Background Task │
│   Component     │   │                  │
│                 │   │ - Process objects │
│   SSE Client    │◄──│ - Update state   │
│   EventSource   │   │ - Log progress   │
└─────────────────┘   └──────────────────┘
        │                      │
        │                      │
        │  GET /migrate/stream/{job_id}
        └──────────────────────┘
                 SSE Events
           (updates every 500ms)
```

## Troubleshooting

### Progress Not Updating
- **Check browser console** for SSE connection errors
- **Verify** the job_id is correct
- **Try refreshing** the page (progress is preserved on server)
- **Check network tab** to see if SSE connection is active

### Migration Stuck
- **Check logs** for error messages
- **Try cancelling** and restarting the migration
- **Verify** Databricks SQL warehouse is running
- **Check** if OpenAI library is available

### Memory Issues with Long Migrations
- Logs are automatically truncated to last 1000 entries
- Consider clearing completed jobs periodically
- Use `DELETE /api/migrate/jobs/{job_id}` to clean up

### SSE Connection Drops
- Browser may close idle connections after 2-5 minutes
- Component includes reconnection logic
- Use the "Refresh" button to manually reconnect
- For production, consider adding heartbeat messages

## Best Practices

1. **Always handle completion callbacks**
   ```tsx
   <MigrationProgress
     jobId={jobId}
     onComplete={(success) => {
       if (success) {
         // Show success message, navigate away, etc.
       } else {
         // Show error, allow retry, etc.
       }
     }}
   />
   ```

2. **Clean up completed jobs**
   ```typescript
   // After reviewing results
   await DatabricksService.deleteMigrationJob(jobId);
   ```

3. **Provide feedback for long operations**
   - Show loading state while starting migration
   - Display estimated time remaining
   - Allow cancellation for very long migrations

4. **Handle errors gracefully**
   ```tsx
   const handleStart = async () => {
     try {
       const result = await DatabricksService.startMigration(request);
       if (!result.success) {
         showError(result.error);
         return;
       }
       setJobId(result.job_id);
     } catch (e) {
       showError('Failed to start migration');
     }
   };
   ```

5. **Test with dry run first**
   - Always use `dry_run: true` for initial tests
   - Verify translations before executing
   - Check logs for warnings

## Performance Tips

1. **Batch small objects** - Group similar objects for faster processing
2. **Use appropriate model** - Llama 4 Maverick for speed, larger models for accuracy
3. **Monitor resource usage** - Check warehouse utilization
4. **Schedule large migrations** - Run during off-peak hours
5. **Parallelize when possible** - Future enhancement for concurrent processing

## Support

For issues or questions:
1. Check the logs in the migration progress viewer
2. Review `/api/migrate/history` for past migrations
3. Use `/api/migrate/progress/{job_id}` for detailed state
4. Contact support with job_id and error logs
