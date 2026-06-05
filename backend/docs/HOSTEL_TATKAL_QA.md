# Hostel Tatkal — double-book QA

## Prerequisites

- Redis running (`REDIS_HOST` / `REDIS_PORT` in `backend/.env`)
- Active sale in `hostel_tatkal_sales` and beds in `hostel_beds` (see `20260603100000_advanced_campus_modules.sql`)
- API on port 4000, frontend on 3000

## Dual-browser test

1. Browser A: `student1@mygyanvihar.com` / `password123` → `/student/hostel-booking`
2. Browser B: `student2@mygyanvihar.com` / `password123` → same URL
3. A selects a green bed → redirected to checkout with **03:00** countdown; bed turns **yellow** on B
4. B clicks the same bed → **409** / toast: another student is checking out
5. A waits 3:00 without paying → redirected with “Session expired”; bed turns **green** on B
6. B can now lock the bed
7. Repeat: A pays within 3:00 → bed **red** for both; B gets **409**

## Redis keys

- Lock: `bed_lock:{bedId}` = `student_user_id`, TTL **180s**
