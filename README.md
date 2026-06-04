# 🎬 Distributed Video Processing System

A scalable web application for uploading, processing, and downloading videos using an asynchronous, queue-based architecture.

---

## 🚀 Overview

This project demonstrates how to design a production-style system that handles large file uploads and long-running tasks efficiently.

Instead of processing videos synchronously, the system offloads heavy work to background workers, ensuring the API remains fast and responsive.

---

## 🧱 Architecture

```
Client (Next.js)
      │
      ▼
API (NestJS)
      │
      ├── PostgreSQL (Prisma)
      │
      └── Redis (BullMQ Queue)
                │
                ▼
            Worker Service
                │
                ▼
             FFmpeg
                │
                ▼
              AWS S3
```

---

## ✨ Features

* User authentication (JWT)
* Direct file uploads using S3 presigned URLs
* Asynchronous video processing pipeline
* Background job handling with retries
* Real-time progress updates via Server-Sent Events (SSE)
* Download processed videos

---

## 🛠️ Tech Stack

**Frontend**

* Next.js (App Router)
* TypeScript

**Backend**

* NestJS
* PostgreSQL
* Prisma ORM

**Infrastructure**

* AWS S3 (file storage)
* Redis (queue + caching)
* BullMQ (job processing)
* FFmpeg (video compression)

---

## 📦 Monorepo Structure

```
media-processor/
│
├── apps/
│   ├── api/        # NestJS API
│   └── worker/     # Background job processor
│
├── packages/       # Shared code (types, utils)
│
├── docker-compose.yml
└── README.md
```

---

## 🔄 How It Works

### 1. Upload Flow

1. Client requests a presigned upload URL
2. API generates S3 presigned URL
3. Client uploads video directly to S3
4. Client notifies API to create a video record

---

### 2. Processing Flow

1. API creates a processing job
2. Job is added to BullMQ queue
3. Worker picks up the job
4. Worker:

   * Downloads video from S3
   * Processes it using FFmpeg
   * Uploads processed file back to S3
5. Database is updated with status

---

### 3. Real-Time Updates

* Client subscribes via SSE:

  ```
  GET /videos/:id/events
  ```
* Receives progress updates:

  ```json
  { "progress": 45 }
  ```

  ```json
  { "status": "completed" }
  ```

---

## 🧪 Running Locally

### 1. Clone the repo

```
git clone https://github.com/kevon-net/media-processor.git
cd media-processor
```

---

### 2. Start services

```
docker-compose up -d
```

---

### 3. Install dependencies

```
pnpm install
```

---

### 4. Setup environment variables

Create `.env` files in:

* `apps/api`
* `apps/worker`

Example:

```
DATABASE_URL=postgresql://user:password@localhost:5432/media
REDIS_HOST=localhost
REDIS_PORT=6379
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=...
JWT_SECRET=...
```

---

### 5. Run applications

```
pnpm dev
```

---

## 🧠 Design Decisions

* **Direct-to-S3 uploads**
  Avoids routing large files through the backend, reducing server load.

* **Queue-based processing**
  Prevents long-running tasks from blocking API requests.

* **Separate worker service**
  Improves scalability and isolates CPU-intensive workloads.

* **SSE over WebSockets**
  Simpler implementation for one-way real-time updates.

* **MVP-first approach**
  Focused only on core functionality to avoid overengineering.

---

## ⚖️ Tradeoffs

* No chunked uploads (limits very large file handling)
* Minimal retry visibility for failed jobs
* No horizontal scaling (single worker instance)
* No observability layer (logging/metrics)

---

## 🔮 Future Improvements

* Horizontal scaling for workers
* Chunked/multipart uploads
* Job retry dashboards
* Observability (logs, tracing, metrics)
* Role-based access & team support

---

## 📌 Key Takeaways

This project focuses on:

* Designing scalable backend systems
* Handling asynchronous workloads
* Working with queues and background processing
* Building production-ready architecture, not just CRUD apps

---

## 📄 License

MIT
