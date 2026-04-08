# mesh-lock

Lock a file before editing to prevent other AI sessions from modifying it simultaneously.

## Usage
/mesh-lock <file-path>
/mesh-lock <file-path> <reason>
/mesh-lock list
/mesh-lock unlock <file-path>

## Instructions

Manage file locks via SLM Mesh to coordinate editing across AI sessions.

1. **Lock a file:** Call `mesh_lock` with action "lock", the file path, and optional reason.
   - Default TTL is 10 minutes (auto-expires)
   - If the file is already locked by another peer, show who holds it and when it expires

2. **List locks:** Call `mesh_lock` with action "query" to show all active locks.

3. **Unlock a file:** Call `mesh_lock` with action "unlock" and the file path.
   - Only the peer that locked the file can unlock it

4. Always show a clear confirmation after lock/unlock operations.

5. If locking fails because another peer holds the lock, suggest the user:
   - Wait for the lock to expire
   - Send a message to the lock holder asking them to release it
   - Work on a different file in the meantime

Examples:
- `/mesh-lock src/auth.ts refactoring JWT validation` → locks auth.ts with reason
- `/mesh-lock list` → shows all active file locks
- `/mesh-lock unlock src/auth.ts` → releases the lock
