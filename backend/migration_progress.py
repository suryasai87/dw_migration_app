"""
Migration Progress Tracking Module
Provides real-time progress updates for database migrations using Server-Sent Events (SSE)
"""
from typing import Dict, Any, Optional, List
import asyncio
import time
import json
from datetime import datetime

# Helper functions for migration job management

def get_migration_lock(job_id: str, locks_dict: Dict[str, asyncio.Lock]) -> asyncio.Lock:
    """Get or create an asyncio lock for a migration job"""
    if job_id not in locks_dict:
        locks_dict[job_id] = asyncio.Lock()
    return locks_dict[job_id]

def initialize_migration_job(job_id: str, jobs_dict: Dict[str, Dict[str, Any]],
                            total_objects: int, source_type: str,
                            target_catalog: str, target_schema: str) -> None:
    """Initialize a new migration job with initial state"""
    jobs_dict[job_id] = {
        "job_id": job_id,
        "status": "running",  # running, completed, failed, cancelled
        "progress_percentage": 0,
        "total_objects": total_objects,
        "completed_objects": 0,
        "failed_objects": 0,
        "current_object": None,
        "source_type": source_type,
        "target_catalog": target_catalog,
        "target_schema": target_schema,
        "start_time": datetime.now().isoformat(),
        "end_time": None,
        "estimated_time_remaining": None,
        "logs": [],
        "object_results": []  # List of {name, type, status, error}
    }

def update_migration_progress(job_id: str, jobs_dict: Dict[str, Dict[str, Any]],
                              **updates) -> None:
    """Update migration job progress"""
    if job_id in jobs_dict:
        jobs_dict[job_id].update(updates)

        # Calculate progress percentage
        if "completed_objects" in updates or "failed_objects" in updates:
            total = jobs_dict[job_id]["total_objects"]
            completed = jobs_dict[job_id]["completed_objects"]
            failed = jobs_dict[job_id]["failed_objects"]
            if total > 0:
                jobs_dict[job_id]["progress_percentage"] = int(((completed + failed) / total) * 100)

        # Estimate time remaining
        if jobs_dict[job_id]["completed_objects"] > 0:
            start_time = datetime.fromisoformat(jobs_dict[job_id]["start_time"])
            elapsed = (datetime.now() - start_time).total_seconds()
            completed = jobs_dict[job_id]["completed_objects"] + jobs_dict[job_id]["failed_objects"]
            remaining = jobs_dict[job_id]["total_objects"] - completed
            if completed > 0:
                avg_time_per_object = elapsed / completed
                jobs_dict[job_id]["estimated_time_remaining"] = int(avg_time_per_object * remaining)

def add_migration_log(job_id: str, jobs_dict: Dict[str, Dict[str, Any]],
                      level: str, message: str) -> None:
    """Add a log entry to the migration job"""
    if job_id in jobs_dict:
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "level": level,  # info, warning, error
            "message": message
        }
        jobs_dict[job_id]["logs"].append(log_entry)

        # Keep only last 1000 log entries to prevent memory issues
        if len(jobs_dict[job_id]["logs"]) > 1000:
            jobs_dict[job_id]["logs"] = jobs_dict[job_id]["logs"][-1000:]

def add_object_result(job_id: str, jobs_dict: Dict[str, Dict[str, Any]],
                     object_name: str, object_type: str, status: str,
                     error: Optional[str] = None, execution_time_ms: Optional[int] = None) -> None:
    """Add an object migration result"""
    if job_id in jobs_dict:
        result = {
            "object_name": object_name,
            "object_type": object_type,
            "status": status,  # success, error, skipped
            "error": error,
            "execution_time_ms": execution_time_ms,
            "timestamp": datetime.now().isoformat()
        }
        jobs_dict[job_id]["object_results"].append(result)

def complete_migration_job(job_id: str, jobs_dict: Dict[str, Dict[str, Any]],
                          status: str = "completed") -> None:
    """Mark a migration job as completed"""
    if job_id in jobs_dict:
        jobs_dict[job_id]["status"] = status
        jobs_dict[job_id]["end_time"] = datetime.now().isoformat()
        jobs_dict[job_id]["progress_percentage"] = 100
        jobs_dict[job_id]["estimated_time_remaining"] = 0

async def generate_sse_events(job_id: str, jobs_dict: Dict[str, Dict[str, Any]],
                             locks_dict: Dict[str, asyncio.Lock]):
    """
    Generate Server-Sent Events for migration progress
    This is an async generator that yields progress updates
    """
    last_sent_log_count = 0
    last_sent_result_count = 0

    while True:
        # Get lock and read current state
        lock = get_migration_lock(job_id, locks_dict)
        async with lock:
            if job_id not in jobs_dict:
                # Job not found
                yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                break

            job = jobs_dict[job_id].copy()

        # Send incremental updates (only new logs and results)
        new_logs = job["logs"][last_sent_log_count:]
        new_results = job["object_results"][last_sent_result_count:]

        update_data = {
            "job_id": job["job_id"],
            "status": job["status"],
            "progress_percentage": job["progress_percentage"],
            "total_objects": job["total_objects"],
            "completed_objects": job["completed_objects"],
            "failed_objects": job["failed_objects"],
            "current_object": job["current_object"],
            "estimated_time_remaining": job["estimated_time_remaining"],
            "new_logs": new_logs,
            "new_results": new_results
        }

        yield f"data: {json.dumps(update_data)}\n\n"

        last_sent_log_count += len(new_logs)
        last_sent_result_count += len(new_results)

        # Check if job is complete
        if job["status"] in ["completed", "failed", "cancelled"]:
            # Send final complete state
            final_data = {
                "job_id": job["job_id"],
                "status": job["status"],
                "progress_percentage": 100,
                "total_objects": job["total_objects"],
                "completed_objects": job["completed_objects"],
                "failed_objects": job["failed_objects"],
                "start_time": job["start_time"],
                "end_time": job["end_time"],
                "complete": True
            }
            yield f"data: {json.dumps(final_data)}\n\n"
            break

        # Wait before next update (send updates every 500ms)
        await asyncio.sleep(0.5)
