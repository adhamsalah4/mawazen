// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import fs3 from "fs/promises";
import { createServer } from "http";
import net from "net";
import path3 from "path";
import { parse as parseCookieHeader2 } from "cookie";
import { SignJWT as SignJWT2, jwtVerify as jwtVerify2 } from "jose";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/firebaseAdmin.ts
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
var initialized = false;
function tryParseServiceAccountJson(raw) {
  return JSON.parse(raw);
}
function decodeBase64ToUtf8(raw) {
  return Buffer.from(raw, "base64").toString("utf8");
}
function parseServiceAccount() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const rawBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!rawJson && !rawBase64) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON");
  }
  let parsed = null;
  const candidates = [];
  if (typeof rawJson === "string" && rawJson.trim()) candidates.push(rawJson.trim());
  if (typeof rawBase64 === "string" && rawBase64.trim()) candidates.push(decodeBase64ToUtf8(rawBase64.trim()));
  for (const candidate of candidates) {
    try {
      parsed = tryParseServiceAccountJson(candidate);
      break;
    } catch {
      try {
        parsed = tryParseServiceAccountJson(decodeBase64ToUtf8(candidate));
        break;
      } catch {
        parsed = null;
      }
    }
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON");
  }
  const projectId = typeof parsed.project_id === "string" ? parsed.project_id : typeof parsed.projectId === "string" ? parsed.projectId : "";
  const clientEmail = typeof parsed.client_email === "string" ? parsed.client_email : typeof parsed.clientEmail === "string" ? parsed.clientEmail : "";
  const rawPrivateKey = typeof parsed.private_key === "string" ? parsed.private_key : typeof parsed.privateKey === "string" ? parsed.privateKey : "";
  if (!projectId || !clientEmail || !rawPrivateKey) {
    throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON");
  }
  const privateKey = rawPrivateKey.includes("\\n") ? rawPrivateKey.replace(/\\n/g, "\n") : rawPrivateKey;
  return {
    project_id: projectId,
    private_key: privateKey,
    client_email: clientEmail
  };
}
function getFirebaseAdmin() {
  if (!initialized) {
    const serviceAccount = parseServiceAccount();
    if (getApps().length === 0) {
      initializeApp({
        credential: cert(serviceAccount)
      });
    }
    initialized = true;
  }
  return {
    auth: () => getAuth()
  };
}

// server/_core/oauth.ts
import axios2 from "axios";

// server/db.ts
import { eq, desc, and, like, or, sql, gte, lte, count, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import crypto from "crypto";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, longtext, timestamp, varchar, boolean, bigint } from "drizzle-orm/mysql-core";
import { datetime } from "drizzle-orm/mysql-core";
var organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }),
  subscriptionPlan: mysqlEnum("subscriptionPlan", ["individual", "law_firm", "enterprise"]).default("individual").notNull(),
  seatLimit: int("seatLimit").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  organizationId: int("organizationId"),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  phone: varchar("phone", { length: 20 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["admin", "lawyer", "assistant", "client"]).default("lawyer").notNull(),
  accountType: mysqlEnum("accountType", ["individual", "law_firm", "enterprise"]).default("individual").notNull(),
  subscriptionPlan: mysqlEnum("subscriptionPlan", ["individual", "law_firm", "enterprise"]).default("individual").notNull(),
  seatLimit: int("seatLimit").default(1).notNull(),
  avatarUrl: text("avatarUrl"),
  specialty: varchar("specialty", { length: 255 }),
  barNumber: varchar("barNumber", { length: 100 }),
  referralCode: varchar("referralCode", { length: 24 }),
  subscriptionEndsAt: timestamp("subscriptionEndsAt"),
  isActive: boolean("isActive").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var appSettings = mysqlTable("appSettings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var referralRedemptions = mysqlTable("referralRedemptions", {
  id: int("id").autoincrement().primaryKey(),
  referrerUserId: int("referrerUserId").notNull(),
  referredUserId: int("referredUserId").notNull(),
  paymentId: varchar("paymentId", { length: 128 }).notNull().unique(),
  referralCode: varchar("referralCode", { length: 24 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var promoRedemptions = mysqlTable("promoRedemptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  paymentId: varchar("paymentId", { length: 128 }).notNull().unique(),
  promoCode: varchar("promoCode", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var activityLogs = mysqlTable("activity_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  action: mysqlEnum("action", ["create", "update", "delete"]).notNull(),
  entityType: mysqlEnum("entityType", ["client", "case", "document"]).notNull(),
  entityId: int("entityId").notNull(),
  description: text("description"),
  oldData: text("oldData"),
  newData: text("newData"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var subscriptionPayments = mysqlTable("subscriptionPayments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  paymentId: varchar("paymentId", { length: 128 }).notNull().unique(),
  plan: mysqlEnum("plan", ["individual", "law_firm", "enterprise"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  nameEn: varchar("nameEn", { length: 255 }),
  type: mysqlEnum("type", ["individual", "company", "government"]).default("individual").notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  secondaryPhone: varchar("secondaryPhone", { length: 20 }),
  nationalId: varchar("nationalId", { length: 20 }),
  commercialRegister: varchar("commercialRegister", { length: 50 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  notes: text("notes"),
  satisfactionScore: int("satisfactionScore").default(0),
  totalPaid: bigint("totalPaid", { mode: "number" }).default(0),
  totalDue: bigint("totalDue", { mode: "number" }).default(0),
  portalToken: varchar("portalToken", { length: 64 }),
  portalEnabled: boolean("portalEnabled").default(false).notNull(),
  createdById: int("createdById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var cases = mysqlTable("cases", {
  id: int("id").autoincrement().primaryKey(),
  caseNumber: varchar("caseNumber", { length: 100 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  type: mysqlEnum("type", ["criminal", "commercial", "family", "administrative", "labor", "real_estate", "other"]).default("other").notNull(),
  court: varchar("court", { length: 255 }),
  courtBranch: varchar("courtBranch", { length: 255 }),
  stage: mysqlEnum("stage", ["intake", "filing", "discovery", "hearing", "judgment", "appeal", "execution", "closed"]).default("intake").notNull(),
  status: mysqlEnum("status", ["active", "pending", "on_hold", "won", "lost", "settled", "closed"]).default("active").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  clientId: int("clientId").notNull(),
  assignedLawyerId: int("assignedLawyerId"),
  opposingParty: varchar("opposingParty", { length: 500 }),
  opposingLawyer: varchar("opposingLawyer", { length: 255 }),
  filingDate: datetime("filingDate"),
  nextHearingDate: datetime("nextHearingDate"),
  closingDate: datetime("closingDate"),
  estimatedValue: bigint("estimatedValue", { mode: "number" }),
  actualValue: bigint("actualValue", { mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var hearings = mysqlTable("hearings", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  hearingDate: timestamp("hearingDate").notNull(),
  location: varchar("location", { length: 255 }),
  courtRoom: varchar("courtRoom", { length: 100 }),
  status: mysqlEnum("status", ["scheduled", "completed", "postponed", "cancelled"]).default("scheduled").notNull(),
  outcome: text("outcome"),
  notes: text("notes"),
  reminderSent: boolean("reminderSent").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 500 }).notNull(),
  description: text("description"),
  type: mysqlEnum("type", ["contract", "memo", "pleading", "evidence", "correspondence", "court_order", "power_of_attorney", "other"]).default("other").notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }),
  fileSize: bigint("fileSize", { mode: "number" }),
  caseId: int("caseId"),
  clientId: int("clientId"),
  serviceProjectId: int("serviceProjectId"),
  version: int("version").default(1),
  parentDocumentId: int("parentDocumentId"),
  isTemplate: boolean("isTemplate").default(false),
  isSharedWithClient: boolean("isSharedWithClient").default(false).notNull(),
  templateCategory: varchar("templateCategory", { length: 100 }),
  expiresAt: datetime("expiresAt"),
  renewAt: datetime("renewAt"),
  reminderDays: int("reminderDays").default(30),
  lastReminderSentAt: datetime("lastReminderSentAt"),
  uploadedById: int("uploadedById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  caseId: int("caseId"),
  serviceProjectId: int("serviceProjectId"),
  assignedToId: int("assignedToId"),
  assignedById: int("assignedById"),
  dueDate: timestamp("dueDate"),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "cancelled"]).default("pending").notNull(),
  completedAt: datetime("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  invoiceNumber: varchar("invoiceNumber", { length: 50 }).notNull().unique(),
  clientId: int("clientId").notNull(),
  caseId: int("caseId"),
  serviceProjectId: int("serviceProjectId"),
  amount: bigint("amount", { mode: "number" }).notNull(),
  taxAmount: bigint("taxAmount", { mode: "number" }).default(0),
  totalAmount: bigint("totalAmount", { mode: "number" }).notNull(),
  currency: varchar("currency", { length: 10 }).default("SAR").notNull(),
  status: mysqlEnum("status", ["draft", "sent", "paid", "partial", "overdue", "cancelled"]).default("draft").notNull(),
  feeType: mysqlEnum("feeType", ["hourly", "fixed", "percentage", "retainer"]).default("fixed").notNull(),
  description: text("description"),
  dueDate: datetime("dueDate"),
  paidDate: datetime("paidDate"),
  paidAmount: bigint("paidAmount", { mode: "number" }).default(0),
  createdById: int("createdById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  currency: varchar("currency", { length: 10 }).default("SAR").notNull(),
  method: mysqlEnum("method", ["cash", "bank_transfer", "credit_card", "stc_pay", "stripe", "other"]).default("bank_transfer").notNull(),
  transactionId: varchar("transactionId", { length: 255 }),
  notes: text("notes"),
  paidAt: timestamp("paidAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var calendarEvents = mysqlTable("calendarEvents", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  eventType: mysqlEnum("eventType", ["hearing", "meeting", "deadline", "reminder", "other"]).default("other").notNull(),
  startTime: timestamp("startTime").notNull(),
  endTime: timestamp("endTime").defaultNow(),
  allDay: boolean("allDay").default(false),
  location: varchar("location", { length: 255 }),
  caseId: int("caseId"),
  userId: int("userId"),
  reminderMinutes: int("reminderMinutes").default(60),
  isRecurring: boolean("isRecurring").default(false),
  recurrenceRule: varchar("recurrenceRule", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var communicationLogs = mysqlTable("communicationLogs", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  caseId: int("caseId"),
  userId: int("userId"),
  type: mysqlEnum("type", ["call", "email", "meeting", "whatsapp", "sms", "other"]).default("other").notNull(),
  direction: mysqlEnum("direction", ["incoming", "outgoing"]).default("outgoing").notNull(),
  subject: varchar("subject", { length: 255 }),
  content: text("content"),
  contactedAt: timestamp("contactedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var aiChatHistory = mysqlTable("aiChatHistory", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  caseId: int("caseId"),
  sessionId: varchar("sessionId", { length: 100 }).notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: mysqlEnum("type", ["hearing", "deadline", "payment", "task", "system"]).default("system").notNull(),
  isRead: boolean("isRead").default(false),
  relatedCaseId: int("relatedCaseId"),
  relatedInvoiceId: int("relatedInvoiceId"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var timeEntries = mysqlTable("timeEntries", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  userId: int("userId").notNull(),
  description: text("description"),
  minutes: int("minutes").notNull(),
  hourlyRate: bigint("hourlyRate", { mode: "number" }),
  billable: boolean("billable").default(true),
  invoiceId: int("invoiceId"),
  entryDate: timestamp("entryDate").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var serviceProjects = mysqlTable("serviceProjects", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  serviceCatalogId: int("serviceCatalogId"),
  clientId: int("clientId"),
  caseId: int("caseId"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["new", "in_progress", "on_hold", "completed", "cancelled"]).default("new").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  assignedToUserId: int("assignedToUserId"),
  createdByUserId: int("createdByUserId"),
  startDate: datetime("startDate"),
  dueDate: datetime("dueDate"),
  completedAt: datetime("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var serviceProjectExpenses = mysqlTable("serviceProjectExpenses", {
  id: int("id").autoincrement().primaryKey(),
  serviceProjectId: int("serviceProjectId").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  currency: varchar("currency", { length: 10 }).default("SAR").notNull(),
  description: text("description"),
  expenseDate: timestamp("expenseDate").defaultNow().notNull(),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var serviceCatalog = mysqlTable("serviceCatalog", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  durationMinutes: int("durationMinutes").default(60).notNull(),
  priceAmount: bigint("priceAmount", { mode: "number" }).default(0).notNull(),
  currency: varchar("currency", { length: 10 }).default("SAR").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var serviceRequests = mysqlTable("serviceRequests", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  serviceId: int("serviceId"),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  clientEmail: varchar("clientEmail", { length: 320 }),
  clientPhone: varchar("clientPhone", { length: 20 }),
  notes: text("notes"),
  preferredAt: datetime("preferredAt"),
  status: mysqlEnum("status", ["new", "in_progress", "completed", "cancelled"]).default("new").notNull(),
  assignedToUserId: int("assignedToUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var sitePages = mysqlTable("sitePages", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  isPublished: boolean("isPublished").default(true).notNull(),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var publicTeamMembers = mysqlTable("publicTeamMembers", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  title: varchar("title", { length: 255 }),
  bio: text("bio"),
  avatarUrl: text("avatarUrl"),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var practiceAreas = mysqlTable("practiceAreas", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var testimonials = mysqlTable("testimonials", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  clientTitle: varchar("clientTitle", { length: 255 }),
  content: text("content").notNull(),
  rating: int("rating").default(5).notNull(),
  isPublished: boolean("isPublished").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var contactMessages = mysqlTable("contactMessages", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["new", "replied", "closed"]).default("new").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var blogPosts = mysqlTable("blogPosts", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  slug: varchar("slug", { length: 150 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  excerpt: text("excerpt"),
  content: text("content"),
  isPublished: boolean("isPublished").default(true).notNull(),
  publishedAt: datetime("publishedAt"),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var toolUsage = mysqlTable("toolUsage", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  tool: varchar("tool", { length: 64 }).notNull(),
  day: varchar("day", { length: 10 }).notNull(),
  count: int("count").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var legalSourceDocuments = mysqlTable("legalSourceDocuments", {
  id: int("id").autoincrement().primaryKey(),
  source: varchar("source", { length: 64 }).notNull(),
  url: text("url").notNull(),
  title: text("title"),
  contentText: longtext("contentText"),
  contentHash: varchar("contentHash", { length: 64 }),
  httpStatus: int("httpStatus"),
  etag: varchar("etag", { length: 255 }),
  lastModified: varchar("lastModified", { length: 255 }),
  fetchedAt: datetime("fetchedAt"),
  status: mysqlEnum("status", ["ok", "error", "skipped"]).default("ok").notNull(),
  error: longtext("error"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var legalSourceChunks = mysqlTable("legalSourceChunks", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull(),
  chunkIndex: int("chunkIndex").notNull(),
  text: text("text").notNull(),
  embeddingJson: text("embeddingJson"),
  metaJson: text("metaJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var legalCrawlerRuns = mysqlTable("legalCrawlerRuns", {
  id: int("id").autoincrement().primaryKey(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  finishedAt: datetime("finishedAt"),
  status: mysqlEnum("status", ["running", "success", "error"]).default("running").notNull(),
  pagesCrawled: int("pagesCrawled").default(0).notNull(),
  documentsUpdated: int("documentsUpdated").default(0).notNull(),
  error: longtext("error")
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "mawazin-legal-assistant-dev",
  cookieSecret: process.env.COOKIE_SECRET ?? process.env.JWT_SECRET ?? "your-super-secret-jwt-key-for-development-12345",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  backendUrl: process.env.BACKEND_URL ?? "",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  llmProvider: process.env.LLM_PROVIDER ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "",
  legalRetrievalDebug: process.env.LEGAL_RETRIEVAL_DEBUG === "true",
  legalRetrievalInsecureTls: process.env.LEGAL_RETRIEVAL_INSECURE_TLS === "true",
  googleApiKey: process.env.GOOGLE_API_KEY ?? "",
  googleCseId: process.env.GOOGLE_CSE_ID ?? "",
  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
  googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
  googleOAuthCallbackUrl: process.env.GOOGLE_CALLBACK_URL ?? "",
  moyasarSecretKey: process.env.MOYASAR_SECRET_KEY ?? "",
  moyasarPublishableKey: process.env.MOYASAR_PUBLISHABLE_KEY ?? "",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "72a786c1e931779748c2066fa5a15a26",
  twilioSmsFrom: process.env.TWILIO_SMS_FROM ?? "+12073877579",
  twilioWhatsappFrom: process.env.TWILIO_WHATSAPP_FROM ?? "",
  legalCrawlerEnabled: process.env.LEGAL_CRAWLER_ENABLED === "true",
  legalCrawlerIntervalMinutes: Number(process.env.LEGAL_CRAWLER_INTERVAL_MINUTES ?? "180"),
  legalCrawlerMaxPagesPerRun: Number(process.env.LEGAL_CRAWLER_MAX_PAGES_PER_RUN ?? "20"),
  legalCrawlerUserAgent: process.env.LEGAL_CRAWLER_USER_AGENT ?? "mawazin-legal-assistant/1.0 (+contact: admin@localhost)",
  legalCrawlerSeedSitemaps: (process.env.LEGAL_CRAWLER_SEED_SITEMAPS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  documentRemindersEnabled: process.env.DOCUMENT_REMINDERS_ENABLED === "true",
  documentRemindersIntervalMinutes: Number(process.env.DOCUMENT_REMINDERS_INTERVAL_MINUTES ?? "1440")
};

// server/db.ts
var _db = null;
var _schemaInitPromise = null;
var inMemoryUsers = /* @__PURE__ */ new Map();
var inMemoryOrganizations = /* @__PURE__ */ new Map();
var inMemoryDocuments = /* @__PURE__ */ new Map();
var inMemoryServiceProjects = /* @__PURE__ */ new Map();
var inMemoryServiceProjectExpenses = /* @__PURE__ */ new Map();
var inMemoryServiceCatalog = /* @__PURE__ */ new Map();
var inMemoryServiceRequests = /* @__PURE__ */ new Map();
var inMemorySitePages = /* @__PURE__ */ new Map();
var inMemoryPublicTeamMembers = /* @__PURE__ */ new Map();
var inMemoryPracticeAreas = /* @__PURE__ */ new Map();
var inMemoryTestimonials = /* @__PURE__ */ new Map();
var inMemoryContactMessages = /* @__PURE__ */ new Map();
var inMemoryBlogPosts = /* @__PURE__ */ new Map();
var inMemoryToolUsage = /* @__PURE__ */ new Map();
var inMemoryLegalDocuments = /* @__PURE__ */ new Map();
var inMemoryLegalChunks = /* @__PURE__ */ new Map();
var inMemoryLegalRuns = /* @__PURE__ */ new Map();
var inMemoryAppSettings = /* @__PURE__ */ new Map();
var inMemoryReferralRedemptions = /* @__PURE__ */ new Map();
var inMemoryPromoRedemptions = /* @__PURE__ */ new Map();
var inMemorySubscriptionPayments = /* @__PURE__ */ new Map();
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      throw new Error("Database connection failed");
    }
  }
  if (!_db) {
    throw new Error("Database is not initialized");
  }
  await ensureSchemaInitialized(_db);
  return _db;
}
async function getUserByReferralCode(referralCode) {
  const code = (referralCode ?? "").trim().toUpperCase();
  if (!code) return null;
  const db = await getDb();
  if (!db) {
    for (const u of inMemoryUsers.values()) {
      if (String(u?.referralCode ?? "").trim().toUpperCase() === code) return u;
    }
    return null;
  }
  const rows = await db.select().from(users).where(eq(users.referralCode, code)).limit(1);
  return rows[0] ?? null;
}
async function getAppSetting(key) {
  const k = (key ?? "").trim();
  if (!k) return null;
  const db = await getDb();
  if (!db) {
    const row = inMemoryAppSettings.get(k);
    return row?.value ?? null;
  }
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, k)).limit(1);
  return rows[0]?.value ?? null;
}
async function setAppSetting(setting) {
  const k = (setting.key ?? "").trim();
  const v = setting.value ?? null;
  if (!k) throw new Error("Invalid setting key");
  const db = await getDb();
  if (!db) {
    inMemoryAppSettings.set(k, { key: k, value: v, updatedAt: /* @__PURE__ */ new Date(), createdAt: /* @__PURE__ */ new Date() });
    return;
  }
  await db.insert(appSettings).values({ key: k, value: v }).onDuplicateKeyUpdate({
    set: { value: v }
  });
}
async function createSubscriptionPayment(row) {
  const db = await getDb();
  if (!db) {
    const existing = Array.from(inMemorySubscriptionPayments.values()).find((p) => p.paymentId === row.paymentId);
    if (existing) return false;
    const id = Date.now() + Math.floor(Math.random() * 1e3);
    inMemorySubscriptionPayments.set(id, { id, ...row, createdAt: /* @__PURE__ */ new Date() });
    return true;
  }
  try {
    await db.insert(subscriptionPayments).values(row);
    return true;
  } catch (e) {
    const msg = String(e?.message ?? "");
    if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) return false;
    throw e;
  }
}
async function hasPromoRedemptionForUser(userId) {
  const db = await getDb();
  if (!db) {
    return Array.from(inMemoryPromoRedemptions.values()).some((r) => Number(r.userId) === Number(userId));
  }
  const rows = await db.select({ id: promoRedemptions.id }).from(promoRedemptions).where(eq(promoRedemptions.userId, userId)).limit(1);
  return rows.length > 0;
}
async function createPromoRedemption(row) {
  const db = await getDb();
  if (!db) {
    const id = Date.now() + Math.floor(Math.random() * 1e3);
    inMemoryPromoRedemptions.set(id, { id, ...row, createdAt: /* @__PURE__ */ new Date() });
    return id;
  }
  const res = await db.insert(promoRedemptions).values(row);
  return res[0].insertId;
}
async function hasReferralRedemptionForReferredUser(referredUserId) {
  const db = await getDb();
  if (!db) {
    return Array.from(inMemoryReferralRedemptions.values()).some(
      (r) => Number(r.referredUserId) === Number(referredUserId)
    );
  }
  const rows = await db.select({ id: referralRedemptions.id }).from(referralRedemptions).where(eq(referralRedemptions.referredUserId, referredUserId)).limit(1);
  return rows.length > 0;
}
async function createReferralRedemption(row) {
  const db = await getDb();
  if (!db) {
    const id = Date.now() + Math.floor(Math.random() * 1e3);
    inMemoryReferralRedemptions.set(id, { id, ...row, createdAt: /* @__PURE__ */ new Date() });
    return id;
  }
  const res = await db.insert(referralRedemptions).values(row);
  return res[0].insertId;
}
function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1e3);
}
async function extendUserSubscription(params) {
  const db = await getDb();
  const now = /* @__PURE__ */ new Date();
  if (!db) {
    for (const [openId, u] of inMemoryUsers.entries()) {
      if (u?.id === params.userId) {
        const base2 = u.subscriptionEndsAt ? new Date(u.subscriptionEndsAt) : now;
        const base22 = base2.getTime() > now.getTime() ? base2 : now;
        inMemoryUsers.set(openId, {
          ...u,
          subscriptionEndsAt: addDays(base22, params.extendDays),
          isActive: true,
          updatedAt: /* @__PURE__ */ new Date()
        });
        return;
      }
    }
    throw new Error("User not found");
  }
  const current = await db.select({ id: users.id, subscriptionEndsAt: users.subscriptionEndsAt }).from(users).where(eq(users.id, params.userId)).limit(1);
  const cur = current[0]?.subscriptionEndsAt ? new Date(current[0].subscriptionEndsAt) : now;
  const base = cur.getTime() > now.getTime() ? cur : now;
  const next = addDays(base, params.extendDays);
  await db.update(users).set({ subscriptionEndsAt: next, isActive: true }).where(eq(users.id, params.userId));
}
async function ensureSchemaInitialized(db) {
  if (_schemaInitPromise) return _schemaInitPromise;
  _schemaInitPromise = (async () => {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS organizations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NULL,
          subscriptionPlan ENUM('individual','law_firm','enterprise') NOT NULL DEFAULT 'individual',
          seatLimit INT NOT NULL DEFAULT 1,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      const colCheck = await db.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'organizationId'
      `);
      const rows = colCheck?.[0] ?? colCheck?.rows ?? colCheck;
      const cntRaw = Array.isArray(rows) ? rows[0]?.cnt : rows?.cnt;
      const cnt = typeof cntRaw === "number" ? cntRaw : Number(cntRaw ?? 0);
      if (!Number.isFinite(cnt) || cnt <= 0) {
        await db.execute(sql`
          ALTER TABLE users
          ADD COLUMN organizationId INT NULL
        `);
      }
      const referralColCheck = await db.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'referralCode'
      `);
      const referralRows = referralColCheck?.[0] ?? referralColCheck?.rows ?? referralColCheck;
      const referralCntRaw = Array.isArray(referralRows) ? referralRows[0]?.cnt : referralRows?.cnt;
      const referralCnt = Number(referralCntRaw ?? 0);
      if (!Number.isFinite(referralCnt) || referralCnt <= 0) {
        await db.execute(sql`
          ALTER TABLE users
          ADD COLUMN referralCode VARCHAR(24) NULL
        `);
      }
      const endsAtColCheck = await db.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'subscriptionEndsAt'
      `);
      const endsAtRows = endsAtColCheck?.[0] ?? endsAtColCheck?.rows ?? endsAtColCheck;
      const endsAtCntRaw = Array.isArray(endsAtRows) ? endsAtRows[0]?.cnt : endsAtRows?.cnt;
      const endsAtCnt = typeof endsAtCntRaw === "number" ? endsAtCntRaw : Number(endsAtCntRaw ?? 0);
      if (!Number.isFinite(endsAtCnt) || endsAtCnt <= 0) {
        await db.execute(sql`
          ALTER TABLE users
          ADD COLUMN subscriptionEndsAt TIMESTAMP NULL
        `);
      }
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS appSettings (
          \`key\` VARCHAR(64) PRIMARY KEY,
          value TEXT NULL,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS referralRedemptions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          referrerUserId INT NOT NULL,
          referredUserId INT NOT NULL,
          paymentId VARCHAR(128) NOT NULL UNIQUE,
          referralCode VARCHAR(24) NOT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS promoRedemptions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          userId INT NOT NULL,
          paymentId VARCHAR(128) NOT NULL UNIQUE,
          promoCode VARCHAR(64) NOT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS subscriptionPayments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          userId INT NOT NULL,
          paymentId VARCHAR(128) NOT NULL UNIQUE,
          plan ENUM('individual','law_firm','enterprise') NOT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS serviceCatalog (
          id INT AUTO_INCREMENT PRIMARY KEY,
          organizationId INT NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT NULL,
          durationMinutes INT NOT NULL DEFAULT 60,
          priceAmount BIGINT NOT NULL DEFAULT 0,
          currency VARCHAR(10) NOT NULL DEFAULT 'SAR',
          isActive BOOLEAN NOT NULL DEFAULT TRUE,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS serviceRequests (
          id INT AUTO_INCREMENT PRIMARY KEY,
          organizationId INT NOT NULL,
          serviceId INT NULL,
          clientName VARCHAR(255) NOT NULL,
          clientEmail VARCHAR(320) NULL,
          clientPhone VARCHAR(20) NULL,
          notes TEXT NULL,
          preferredAt TIMESTAMP NULL,
          status ENUM('new','in_progress','completed','cancelled') NOT NULL DEFAULT 'new',
          assignedToUserId INT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS sitePages (
          id INT AUTO_INCREMENT PRIMARY KEY,
          organizationId INT NOT NULL,
          slug VARCHAR(100) NOT NULL,
          title VARCHAR(255) NOT NULL,
          content TEXT NULL,
          isPublished BOOLEAN NOT NULL DEFAULT TRUE,
          updatedByUserId INT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS publicTeamMembers (
          id INT AUTO_INCREMENT PRIMARY KEY,
          organizationId INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          title VARCHAR(255) NULL,
          bio TEXT NULL,
          avatarUrl TEXT NULL,
          sortOrder INT NOT NULL DEFAULT 0,
          isActive BOOLEAN NOT NULL DEFAULT TRUE,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS practiceAreas (
          id INT AUTO_INCREMENT PRIMARY KEY,
          organizationId INT NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT NULL,
          sortOrder INT NOT NULL DEFAULT 0,
          isActive BOOLEAN NOT NULL DEFAULT TRUE,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS testimonials (
          id INT AUTO_INCREMENT PRIMARY KEY,
          organizationId INT NOT NULL,
          clientName VARCHAR(255) NOT NULL,
          clientTitle VARCHAR(255) NULL,
          content TEXT NOT NULL,
          rating INT NOT NULL DEFAULT 5,
          isPublished BOOLEAN NOT NULL DEFAULT TRUE,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS contactMessages (
          id INT AUTO_INCREMENT PRIMARY KEY,
          organizationId INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(320) NULL,
          phone VARCHAR(20) NULL,
          message TEXT NOT NULL,
          status ENUM('new','replied','closed') NOT NULL DEFAULT 'new',
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS blogPosts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          organizationId INT NOT NULL,
          slug VARCHAR(150) NOT NULL,
          title VARCHAR(255) NOT NULL,
          excerpt TEXT NULL,
          content TEXT NULL,
          isPublished BOOLEAN NOT NULL DEFAULT TRUE,
          publishedAt TIMESTAMP NULL,
          updatedByUserId INT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS toolUsage (
          id INT AUTO_INCREMENT PRIMARY KEY,
          organizationId INT NOT NULL,
          tool VARCHAR(64) NOT NULL,
          day VARCHAR(10) NOT NULL,
          count INT NOT NULL DEFAULT 0,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS legalSourceDocuments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          source VARCHAR(64) NOT NULL,
          url TEXT NOT NULL,
          title TEXT NULL,
          contentText LONGTEXT NULL,
          contentHash VARCHAR(64) NULL,
          httpStatus INT NULL,
          etag VARCHAR(255) NULL,
          lastModified VARCHAR(255) NULL,
          fetchedAt TIMESTAMP NULL,
          status ENUM('ok','error','skipped') NOT NULL DEFAULT 'ok',
          error LONGTEXT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS legalSourceChunks (
          id INT AUTO_INCREMENT PRIMARY KEY,
          documentId INT NOT NULL,
          chunkIndex INT NOT NULL,
          text TEXT NOT NULL,
          embeddingJson TEXT NULL,
          metaJson TEXT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS legalCrawlerRuns (
          id INT AUTO_INCREMENT PRIMARY KEY,
          startedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          finishedAt TIMESTAMP NULL,
          status ENUM('running','success','error') NOT NULL DEFAULT 'running',
          pagesCrawled INT NOT NULL DEFAULT 0,
          documentsUpdated INT NOT NULL DEFAULT 0,
          error LONGTEXT NULL
        )
      `);
    } catch (error) {
      console.warn("[Database] Schema initialization failed:", error);
    }
  })();
  return _schemaInitPromise;
}
async function createLegalCrawlerRun(run) {
  const db = await getDb();
  if (!db) {
    const id = Date.now();
    inMemoryLegalRuns.set(id, { id, ...run });
    return id;
  }
  const result = await db.insert(legalCrawlerRuns).values(run);
  return result[0].insertId;
}
async function finishLegalCrawlerRun(params) {
  const truncateForDb = (value, maxLen) => {
    if (!value) return null;
    const s = String(value);
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen)}
...[truncated ${s.length - maxLen} chars]`;
  };
  const db = await getDb();
  if (!db) {
    const existing = inMemoryLegalRuns.get(params.id) ?? { id: params.id };
    inMemoryLegalRuns.set(params.id, {
      ...existing,
      status: params.status,
      pagesCrawled: params.pagesCrawled,
      documentsUpdated: params.documentsUpdated,
      error: truncateForDb(params.error, 8e3),
      finishedAt: /* @__PURE__ */ new Date()
    });
    return;
  }
  await db.update(legalCrawlerRuns).set({
    status: params.status,
    pagesCrawled: params.pagesCrawled,
    documentsUpdated: params.documentsUpdated,
    error: truncateForDb(params.error, 8e3),
    finishedAt: /* @__PURE__ */ new Date()
  }).where(eq(legalCrawlerRuns.id, params.id));
}
async function upsertLegalSourceDocument(doc) {
  const truncateForDb = (value, maxLen) => {
    if (!value) return null;
    const s = String(value);
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen)}
...[truncated ${s.length - maxLen} chars]`;
  };
  const safeDoc = {
    ...doc,
    error: truncateForDb(doc.error, 8e3)
  };
  const dbConn = await getDb();
  if (!dbConn) {
    const existing2 = Array.from(inMemoryLegalDocuments.values()).find((d) => d.source === doc.source && d.url === doc.url);
    if (existing2?.id) {
      inMemoryLegalDocuments.set(existing2.id, { ...existing2, ...safeDoc, updatedAt: /* @__PURE__ */ new Date() });
      return existing2.id;
    }
    const id = Date.now();
    inMemoryLegalDocuments.set(id, { id, ...safeDoc, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() });
    return id;
  }
  const existing = await dbConn.select({ id: legalSourceDocuments.id, contentHash: legalSourceDocuments.contentHash }).from(legalSourceDocuments).where(and(eq(legalSourceDocuments.source, doc.source), eq(legalSourceDocuments.url, doc.url))).limit(1);
  if (existing[0]?.id) {
    await dbConn.update(legalSourceDocuments).set(safeDoc).where(eq(legalSourceDocuments.id, existing[0].id));
    return existing[0].id;
  }
  const result = await dbConn.insert(legalSourceDocuments).values(safeDoc);
  return result[0].insertId;
}
async function getLegalSourceDocumentBySourceUrl(params) {
  const dbConn = await getDb();
  if (!dbConn) {
    return Array.from(inMemoryLegalDocuments.values()).find((d) => d.source === params.source && d.url === params.url) ?? null;
  }
  const rows = await dbConn.select().from(legalSourceDocuments).where(and(eq(legalSourceDocuments.source, params.source), eq(legalSourceDocuments.url, params.url))).limit(1);
  return rows[0] ?? null;
}
async function replaceLegalChunksForDocument(params) {
  const dbConn = await getDb();
  if (!dbConn) {
    for (const [id, chunk] of Array.from(inMemoryLegalChunks.entries())) {
      if (chunk.documentId === params.documentId) inMemoryLegalChunks.delete(id);
    }
    for (const c of params.chunks) {
      const id = Date.now() + Math.floor(Math.random() * 1e3);
      inMemoryLegalChunks.set(id, { id, documentId: params.documentId, ...c, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() });
    }
    return;
  }
  await dbConn.delete(legalSourceChunks).where(eq(legalSourceChunks.documentId, params.documentId));
  if (params.chunks.length === 0) return;
  await dbConn.insert(legalSourceChunks).values(
    params.chunks.map((c) => ({
      documentId: params.documentId,
      ...c
    }))
  );
}
async function listLegalChunksWithEmbeddings(params) {
  const dbConn = await getDb();
  if (!dbConn) {
    const chunks = Array.from(inMemoryLegalChunks.values()).filter((c) => typeof c.embeddingJson === "string" && c.embeddingJson.length > 0).slice(0, params.limit);
    const docById = new Map(Array.from(inMemoryLegalDocuments.values()).map((d) => [d.id, d]));
    return chunks.map((c) => ({
      ...c,
      document: docById.get(c.documentId) ?? null
    }));
  }
  const rows = await dbConn.select({
    chunkId: legalSourceChunks.id,
    documentId: legalSourceChunks.documentId,
    chunkIndex: legalSourceChunks.chunkIndex,
    text: legalSourceChunks.text,
    embeddingJson: legalSourceChunks.embeddingJson,
    metaJson: legalSourceChunks.metaJson,
    url: legalSourceDocuments.url,
    source: legalSourceDocuments.source,
    title: legalSourceDocuments.title
  }).from(legalSourceChunks).innerJoin(legalSourceDocuments, eq(legalSourceDocuments.id, legalSourceChunks.documentId)).where(sql`${legalSourceChunks.embeddingJson} IS NOT NULL`).limit(params.limit);
  return rows;
}
async function listLegalChunksByTextSearch(params) {
  const terms = (params.terms ?? []).map((t2) => String(t2 ?? "").trim()).filter(Boolean);
  if (terms.length === 0) return [];
  const dbConn = await getDb();
  if (!dbConn) {
    const docById = new Map(Array.from(inMemoryLegalDocuments.values()).map((d) => [d.id, d]));
    const chunks = Array.from(inMemoryLegalChunks.values()).filter((c) => {
      const text2 = String(c?.text ?? "");
      return terms.some((t2) => text2.includes(t2));
    }).slice(0, params.limit);
    return chunks.map((c) => ({
      chunkId: c.id,
      documentId: c.documentId,
      chunkIndex: c.chunkIndex,
      text: c.text,
      embeddingJson: c.embeddingJson,
      metaJson: c.metaJson,
      url: docById.get(c.documentId)?.url ?? "",
      source: docById.get(c.documentId)?.source ?? "",
      title: docById.get(c.documentId)?.title ?? null
    }));
  }
  const whereClause = or(
    ...terms.map((t2) => like(legalSourceChunks.text, `%${t2}%`))
  );
  const rows = await dbConn.select({
    chunkId: legalSourceChunks.id,
    documentId: legalSourceChunks.documentId,
    chunkIndex: legalSourceChunks.chunkIndex,
    text: legalSourceChunks.text,
    embeddingJson: legalSourceChunks.embeddingJson,
    metaJson: legalSourceChunks.metaJson,
    url: legalSourceDocuments.url,
    source: legalSourceDocuments.source,
    title: legalSourceDocuments.title
  }).from(legalSourceChunks).innerJoin(legalSourceDocuments, eq(legalSourceDocuments.id, legalSourceChunks.documentId)).where(whereClause).limit(params.limit);
  return rows;
}
function toDayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
async function getToolUsageCount(params) {
  const day = params.day ?? toDayKey(/* @__PURE__ */ new Date());
  const db = await getDb();
  if (!db) {
    const key = `${params.organizationId}:${params.tool}:${day}`;
    return inMemoryToolUsage.get(key)?.count ?? 0;
  }
  const rows = await db.select({ count: toolUsage.count }).from(toolUsage).where(and(eq(toolUsage.organizationId, params.organizationId), eq(toolUsage.tool, params.tool), eq(toolUsage.day, day))).limit(1);
  return rows[0]?.count ?? 0;
}
async function incrementToolUsage(params) {
  const day = params.day ?? toDayKey(/* @__PURE__ */ new Date());
  const inc = params.increment ?? 1;
  const db = await getDb();
  if (!db) {
    const key = `${params.organizationId}:${params.tool}:${day}`;
    const existing2 = inMemoryToolUsage.get(key) ?? { count: 0 };
    inMemoryToolUsage.set(key, { ...existing2, count: (existing2.count ?? 0) + inc, updatedAt: /* @__PURE__ */ new Date() });
    return;
  }
  const existing = await db.select({ id: toolUsage.id, count: toolUsage.count }).from(toolUsage).where(and(eq(toolUsage.organizationId, params.organizationId), eq(toolUsage.tool, params.tool), eq(toolUsage.day, day))).limit(1);
  if (existing[0]?.id) {
    await db.update(toolUsage).set({ count: (existing[0].count ?? 0) + inc }).where(eq(toolUsage.id, existing[0].id));
    return;
  }
  const row = {
    organizationId: params.organizationId,
    tool: params.tool,
    day,
    count: inc
  };
  await db.insert(toolUsage).values(row);
}
async function getDefaultPublicOrganizationId() {
  if (ENV.ownerOpenId) {
    const owner = await getUserByOpenId(ENV.ownerOpenId);
    if (owner?.organizationId) return owner.organizationId;
  }
  const db = await getDb();
  if (!db) {
    const first = Array.from(inMemoryOrganizations.keys()).sort((a, b) => a - b)[0];
    if (first) return first;
    const id2 = await createOrganization({
      name: "Default",
      subscriptionPlan: "individual",
      seatLimit: 1
    });
    return id2;
  }
  const orgs = await db.select({ id: organizations.id }).from(organizations).orderBy(asc(organizations.id)).limit(1);
  if (orgs[0]?.id) return orgs[0].id;
  const id = await createOrganization({
    name: "Default",
    subscriptionPlan: "individual",
    seatLimit: 1
  });
  return id;
}
async function createOrganization(org) {
  const db = await getDb();
  if (!db) {
    const id = Date.now();
    inMemoryOrganizations.set(id, {
      id,
      ...org,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    return id;
  }
  const result = await db.insert(organizations).values(org);
  return result[0].insertId;
}
async function getOrganizationById(orgId) {
  const db = await getDb();
  if (!db) return inMemoryOrganizations.get(orgId);
  const result = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return result[0];
}
async function getAllOrganizations() {
  const db = await getDb();
  if (!db) return Array.from(inMemoryOrganizations.values());
  return db.select().from(organizations).orderBy(desc(organizations.createdAt));
}
async function setOrganizationSubscriptionPlan(params) {
  const db = await getDb();
  if (!db) {
    const org = inMemoryOrganizations.get(params.organizationId);
    if (!org) throw new Error("Organization not found");
    inMemoryOrganizations.set(params.organizationId, {
      ...org,
      subscriptionPlan: params.subscriptionPlan,
      seatLimit: params.seatLimit,
      updatedAt: /* @__PURE__ */ new Date()
    });
    return;
  }
  await db.update(organizations).set({
    subscriptionPlan: params.subscriptionPlan,
    seatLimit: params.seatLimit
  }).where(eq(organizations.id, params.organizationId));
}
async function getOrganizationMemberCount(organizationId) {
  const db = await getDb();
  if (!db) {
    let c = 0;
    for (const u of inMemoryUsers.values()) {
      if (u?.organizationId === organizationId) c += 1;
    }
    return c;
  }
  const result = await db.select({ count: count() }).from(users).where(eq(users.organizationId, organizationId));
  return result[0]?.count ?? 0;
}
async function getUsersByOrganizationId(organizationId) {
  const db = await getDb();
  if (!db) {
    const list = [];
    for (const u of inMemoryUsers.values()) {
      if (u?.organizationId === organizationId) list.push(u);
    }
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }
  return db.select().from(users).where(eq(users.organizationId, organizationId)).orderBy(desc(users.createdAt));
}
async function getServiceCatalogByOrganizationId(organizationId, onlyActive = false) {
  const db = await getDb();
  if (!db) {
    const list = [];
    for (const s of inMemoryServiceCatalog.values()) {
      if (s?.organizationId !== organizationId) continue;
      if (onlyActive && !s?.isActive) continue;
      list.push(s);
    }
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }
  const whereClause = onlyActive ? and(eq(serviceCatalog.organizationId, organizationId), eq(serviceCatalog.isActive, true)) : eq(serviceCatalog.organizationId, organizationId);
  return db.select().from(serviceCatalog).where(whereClause).orderBy(desc(serviceCatalog.createdAt));
}
async function createServiceCatalogItem(item) {
  const db = await getDb();
  if (!db) {
    const id = Date.now();
    inMemoryServiceCatalog.set(id, {
      id,
      ...item,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    return id;
  }
  const result = await db.insert(serviceCatalog).values(item);
  return result[0].insertId;
}
async function updateServiceCatalogItem(id, data) {
  const db = await getDb();
  if (!db) {
    const existing = inMemoryServiceCatalog.get(id);
    if (!existing) throw new Error("Service not found");
    inMemoryServiceCatalog.set(id, { ...existing, ...data, updatedAt: /* @__PURE__ */ new Date() });
    return;
  }
  await db.update(serviceCatalog).set(data).where(eq(serviceCatalog.id, id));
}
async function createServiceRequest(req) {
  const db = await getDb();
  if (!db) {
    const id = Date.now();
    inMemoryServiceRequests.set(id, {
      id,
      ...req,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    return id;
  }
  const result = await db.insert(serviceRequests).values(req);
  return result[0].insertId;
}
async function getServiceRequestsByOrganizationId(organizationId, status) {
  const db = await getDb();
  if (!db) {
    const list = [];
    for (const r of inMemoryServiceRequests.values()) {
      if (r?.organizationId !== organizationId) continue;
      if (status && r?.status !== status) continue;
      list.push(r);
    }
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }
  const whereClause = status ? and(eq(serviceRequests.organizationId, organizationId), eq(serviceRequests.status, status)) : eq(serviceRequests.organizationId, organizationId);
  return db.select().from(serviceRequests).where(whereClause).orderBy(desc(serviceRequests.createdAt));
}
async function updateServiceRequest(id, data) {
  const db = await getDb();
  if (!db) {
    const existing = inMemoryServiceRequests.get(id);
    if (!existing) throw new Error("Service request not found");
    inMemoryServiceRequests.set(id, { ...existing, ...data, updatedAt: /* @__PURE__ */ new Date() });
    return;
  }
  await db.update(serviceRequests).set(data).where(eq(serviceRequests.id, id));
}
async function getSitePageBySlug(params) {
  const db = await getDb();
  if (!db) {
    for (const p of inMemorySitePages.values()) {
      if (p?.organizationId !== params.organizationId) continue;
      if (p?.slug !== params.slug) continue;
      if (params.onlyPublished && !p?.isPublished) continue;
      return p;
    }
    return void 0;
  }
  const whereClause = params.onlyPublished ? and(eq(sitePages.organizationId, params.organizationId), eq(sitePages.slug, params.slug), eq(sitePages.isPublished, true)) : and(eq(sitePages.organizationId, params.organizationId), eq(sitePages.slug, params.slug));
  const result = await db.select().from(sitePages).where(whereClause).limit(1);
  return result[0];
}
async function upsertSitePage(page) {
  const db = await getDb();
  if (!db) {
    const existing2 = Array.from(inMemorySitePages.values()).find(
      (p) => p?.organizationId === page.organizationId && p?.slug === page.slug
    );
    if (existing2) {
      inMemorySitePages.set(existing2.id, { ...existing2, ...page, updatedAt: /* @__PURE__ */ new Date() });
      return existing2.id;
    }
    const id = Date.now();
    inMemorySitePages.set(id, { id, ...page, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() });
    return id;
  }
  const existing = await db.select({ id: sitePages.id }).from(sitePages).where(and(eq(sitePages.organizationId, page.organizationId), eq(sitePages.slug, page.slug))).limit(1);
  if (existing[0]?.id) {
    await db.update(sitePages).set(page).where(eq(sitePages.id, existing[0].id));
    return existing[0].id;
  }
  const result = await db.insert(sitePages).values(page);
  return result[0].insertId;
}
async function listSitePagesByOrganizationId(organizationId) {
  const db = await getDb();
  if (!db) {
    const list = [];
    for (const p of inMemorySitePages.values()) {
      if (p?.organizationId === organizationId) list.push(p);
    }
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list;
  }
  return db.select().from(sitePages).where(eq(sitePages.organizationId, organizationId)).orderBy(desc(sitePages.updatedAt));
}
async function listPublicTeamMembers(organizationId, onlyActive = true) {
  const db = await getDb();
  if (!db) {
    const list = [];
    for (const m of inMemoryPublicTeamMembers.values()) {
      if (m?.organizationId !== organizationId) continue;
      if (onlyActive && !m?.isActive) continue;
      list.push(m);
    }
    list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return list;
  }
  const whereClause = onlyActive ? and(eq(publicTeamMembers.organizationId, organizationId), eq(publicTeamMembers.isActive, true)) : eq(publicTeamMembers.organizationId, organizationId);
  return db.select().from(publicTeamMembers).where(whereClause).orderBy(asc(publicTeamMembers.sortOrder));
}
async function createPublicTeamMember(member) {
  const db = await getDb();
  if (!db) {
    const id = Date.now();
    inMemoryPublicTeamMembers.set(id, { id, ...member, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() });
    return id;
  }
  const result = await db.insert(publicTeamMembers).values(member);
  return result[0].insertId;
}
async function updatePublicTeamMember(id, data) {
  const db = await getDb();
  if (!db) {
    const existing = inMemoryPublicTeamMembers.get(id);
    if (!existing) throw new Error("Team member not found");
    inMemoryPublicTeamMembers.set(id, { ...existing, ...data, updatedAt: /* @__PURE__ */ new Date() });
    return;
  }
  await db.update(publicTeamMembers).set(data).where(eq(publicTeamMembers.id, id));
}
async function listPracticeAreas(organizationId, onlyActive = true) {
  const db = await getDb();
  if (!db) {
    const list = [];
    for (const a of inMemoryPracticeAreas.values()) {
      if (a?.organizationId !== organizationId) continue;
      if (onlyActive && !a?.isActive) continue;
      list.push(a);
    }
    list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return list;
  }
  const whereClause = onlyActive ? and(eq(practiceAreas.organizationId, organizationId), eq(practiceAreas.isActive, true)) : eq(practiceAreas.organizationId, organizationId);
  return db.select().from(practiceAreas).where(whereClause).orderBy(asc(practiceAreas.sortOrder));
}
async function createPracticeArea(area) {
  const db = await getDb();
  if (!db) {
    const id = Date.now();
    inMemoryPracticeAreas.set(id, { id, ...area, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() });
    return id;
  }
  const result = await db.insert(practiceAreas).values(area);
  return result[0].insertId;
}
async function updatePracticeArea(id, data) {
  const db = await getDb();
  if (!db) {
    const existing = inMemoryPracticeAreas.get(id);
    if (!existing) throw new Error("Practice area not found");
    inMemoryPracticeAreas.set(id, { ...existing, ...data, updatedAt: /* @__PURE__ */ new Date() });
    return;
  }
  await db.update(practiceAreas).set(data).where(eq(practiceAreas.id, id));
}
async function listTestimonials(organizationId, onlyPublished = true) {
  const db = await getDb();
  if (!db) {
    const list = [];
    for (const t2 of inMemoryTestimonials.values()) {
      if (t2?.organizationId !== organizationId) continue;
      if (onlyPublished && !t2?.isPublished) continue;
      list.push(t2);
    }
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }
  const whereClause = onlyPublished ? and(eq(testimonials.organizationId, organizationId), eq(testimonials.isPublished, true)) : eq(testimonials.organizationId, organizationId);
  return db.select().from(testimonials).where(whereClause).orderBy(desc(testimonials.createdAt));
}
async function createTestimonial(t2) {
  const db = await getDb();
  if (!db) {
    const id = Date.now();
    inMemoryTestimonials.set(id, { id, ...t2, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() });
    return id;
  }
  const result = await db.insert(testimonials).values(t2);
  return result[0].insertId;
}
async function updateTestimonial(id, data) {
  const db = await getDb();
  if (!db) {
    const existing = inMemoryTestimonials.get(id);
    if (!existing) throw new Error("Testimonial not found");
    inMemoryTestimonials.set(id, { ...existing, ...data, updatedAt: /* @__PURE__ */ new Date() });
    return;
  }
  await db.update(testimonials).set(data).where(eq(testimonials.id, id));
}
async function createContactMessage(msg) {
  const db = await getDb();
  if (!db) {
    const id = Date.now();
    inMemoryContactMessages.set(id, { id, ...msg, createdAt: /* @__PURE__ */ new Date() });
    return id;
  }
  const result = await db.insert(contactMessages).values(msg);
  return result[0].insertId;
}
async function listContactMessagesByOrganizationId(organizationId, status) {
  const db = await getDb();
  if (!db) {
    const list = [];
    for (const m of inMemoryContactMessages.values()) {
      if (m?.organizationId !== organizationId) continue;
      if (status && m?.status !== status) continue;
      list.push(m);
    }
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }
  const whereClause = status ? and(eq(contactMessages.organizationId, organizationId), eq(contactMessages.status, status)) : eq(contactMessages.organizationId, organizationId);
  return db.select().from(contactMessages).where(whereClause).orderBy(desc(contactMessages.createdAt));
}
async function updateContactMessageStatus(id, status) {
  const db = await getDb();
  if (!db) {
    const existing = inMemoryContactMessages.get(id);
    if (!existing) throw new Error("Contact message not found");
    inMemoryContactMessages.set(id, { ...existing, status });
    return;
  }
  await db.update(contactMessages).set({ status }).where(eq(contactMessages.id, id));
}
async function listBlogPostsByOrganizationId(organizationId, onlyPublished = true) {
  const db = await getDb();
  if (!db) {
    const list = [];
    for (const p of inMemoryBlogPosts.values()) {
      if (p?.organizationId !== organizationId) continue;
      if (onlyPublished && !p?.isPublished) continue;
      list.push(p);
    }
    list.sort((a, b) => new Date(b.publishedAt ?? b.createdAt).getTime() - new Date(a.publishedAt ?? a.createdAt).getTime());
    return list;
  }
  const whereClause = onlyPublished ? and(eq(blogPosts.organizationId, organizationId), eq(blogPosts.isPublished, true)) : eq(blogPosts.organizationId, organizationId);
  return db.select().from(blogPosts).where(whereClause).orderBy(desc(blogPosts.publishedAt), desc(blogPosts.createdAt));
}
async function getBlogPostBySlug(params) {
  const db = await getDb();
  if (!db) {
    for (const p of inMemoryBlogPosts.values()) {
      if (p?.organizationId !== params.organizationId) continue;
      if (p?.slug !== params.slug) continue;
      if (params.onlyPublished && !p?.isPublished) continue;
      return p;
    }
    return void 0;
  }
  const whereClause = params.onlyPublished ? and(eq(blogPosts.organizationId, params.organizationId), eq(blogPosts.slug, params.slug), eq(blogPosts.isPublished, true)) : and(eq(blogPosts.organizationId, params.organizationId), eq(blogPosts.slug, params.slug));
  const result = await db.select().from(blogPosts).where(whereClause).limit(1);
  return result[0];
}
async function upsertBlogPost(post) {
  const db = await getDb();
  const now = /* @__PURE__ */ new Date();
  const normalized = {
    ...post,
    publishedAt: post.isPublished ? post.publishedAt ?? now : post.publishedAt ?? null
  };
  if (!db) {
    const existing2 = Array.from(inMemoryBlogPosts.values()).find(
      (p) => p?.organizationId === normalized.organizationId && p?.slug === normalized.slug
    );
    if (existing2) {
      inMemoryBlogPosts.set(existing2.id, { ...existing2, ...normalized, updatedAt: now });
      return existing2.id;
    }
    const id = Date.now();
    inMemoryBlogPosts.set(id, { id, ...normalized, createdAt: now, updatedAt: now });
    return id;
  }
  const existing = await db.select({ id: blogPosts.id }).from(blogPosts).where(and(eq(blogPosts.organizationId, normalized.organizationId), eq(blogPosts.slug, normalized.slug))).limit(1);
  if (existing[0]?.id) {
    await db.update(blogPosts).set(normalized).where(eq(blogPosts.id, existing[0].id));
    return existing[0].id;
  }
  const result = await db.insert(blogPosts).values(normalized);
  return result[0].insertId;
}
async function ensureUserHasOrganization(params) {
  const user = await getUserByOpenId(params.openId);
  if (!user) throw new Error("User not found");
  if (user.organizationId) return user.organizationId;
  const fallbackPlan = user.subscriptionPlan ?? "individual";
  const fallbackSeatLimit = user.seatLimit ?? 1;
  const organizationId = await createOrganization({
    name: params.defaultOrganizationName ?? user.name ?? null,
    subscriptionPlan: fallbackPlan,
    seatLimit: fallbackSeatLimit
  });
  await upsertUser({
    openId: user.openId,
    organizationId
  });
  return organizationId;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Using in-memory storage for user:", user.openId);
    const normalizeOptional = (value) => {
      if (value === void 0) return void 0;
      if (value === null) return null;
      if (typeof value === "string") {
        const t2 = value.trim();
        return t2.length > 0 ? t2 : null;
      }
      return value;
    };
    const nextEmail = typeof user.email === "string" ? user.email.trim().toLowerCase() : normalizeOptional(user.email);
    const nextPhone = normalizeOptional(user.phone);
    if (typeof nextEmail === "string") {
      for (const [openId, existing] of inMemoryUsers.entries()) {
        if (openId === user.openId) continue;
        const v = typeof existing?.email === "string" ? existing.email.trim() : "";
        if (v && v.toLowerCase() === nextEmail) {
          throw new Error("EMAIL_ALREADY_IN_USE");
        }
      }
    }
    if (typeof nextPhone === "string") {
      for (const [openId, existing] of inMemoryUsers.entries()) {
        if (openId === user.openId) continue;
        const v = typeof existing?.phone === "string" ? existing.phone.trim() : "";
        if (v && v === nextPhone) {
          throw new Error("PHONE_ALREADY_IN_USE");
        }
      }
    }
    const existingUser = inMemoryUsers.get(user.openId);
    const ensureReferralCode = () => {
      const existing = existingUser?.referralCode;
      if (typeof existing === "string" && existing.trim()) return existing;
      const buf = crypto.randomBytes(8);
      const code = buf.toString("base64").replaceAll("+", "A").replaceAll("/", "B").replaceAll("=", "C").toUpperCase().slice(0, 10);
      return code;
    };
    const referralCode = user.referralCode ?? ensureReferralCode();
    const updatedUser = {
      ...existingUser,
      ...user,
      referralCode,
      id: existingUser?.id || Date.now(),
      createdAt: existingUser?.createdAt || /* @__PURE__ */ new Date(),
      lastSignedIn: user.lastSignedIn || /* @__PURE__ */ new Date()
    };
    inMemoryUsers.set(user.openId, updatedUser);
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const normalizeReferralCode = (v) => {
      if (v === void 0) return void 0;
      if (v === null) return null;
      if (typeof v !== "string") return String(v);
      const t2 = v.trim();
      return t2 ? t2.toUpperCase() : null;
    };
    const ensureReferralCode = async () => {
      const existing = await db.select({ referralCode: users.referralCode }).from(users).where(eq(users.openId, user.openId)).limit(1);
      const existingCode = existing[0]?.referralCode;
      if (typeof existingCode === "string" && existingCode.trim()) return existingCode;
      for (let i = 0; i < 10; i++) {
        const buf = crypto.randomBytes(8);
        const code = buf.toString("base64").replaceAll("+", "A").replaceAll("/", "B").replaceAll("=", "C").toUpperCase().slice(0, 10);
        const dup = await db.select({ openId: users.openId }).from(users).where(eq(users.referralCode, code)).limit(1);
        if (dup.length === 0) return code;
      }
      throw new Error("FAILED_TO_GENERATE_REFERRAL_CODE");
    };
    const textFields = ["name", "email", "loginMethod", "phone", "avatarUrl", "specialty", "barNumber"];
    const normalizeTextField = (field, value) => {
      if (value === void 0) return void 0;
      if (value === null) return null;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      if ((field === "email" || field === "phone") && trimmed.length === 0) return null;
      if (field === "email") return trimmed.toLowerCase();
      return trimmed;
    };
    const assignNullable = (field) => {
      const value = normalizeTextField(field, user[field]);
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.organizationId !== void 0) {
      const normalized = user.organizationId ?? null;
      values.organizationId = normalized;
      updateSet.organizationId = normalized;
    }
    if (user.subscriptionEndsAt !== void 0) {
      const normalized = user.subscriptionEndsAt ?? null;
      values.subscriptionEndsAt = normalized;
      updateSet.subscriptionEndsAt = normalized;
    }
    const desiredReferralCode = normalizeReferralCode(user.referralCode);
    const finalReferralCode = desiredReferralCode ?? await ensureReferralCode();
    values.referralCode = finalReferralCode;
    if (desiredReferralCode !== void 0) {
      updateSet.referralCode = desiredReferralCode;
    } else {
      updateSet.referralCode = finalReferralCode;
    }
    if (user.accountType !== void 0) {
      values.accountType = user.accountType;
      updateSet.accountType = user.accountType;
    } else {
      values.accountType = "individual";
    }
    if (user.subscriptionPlan !== void 0) {
      values.subscriptionPlan = user.subscriptionPlan;
      updateSet.subscriptionPlan = user.subscriptionPlan;
    } else {
      values.subscriptionPlan = "individual";
    }
    if (user.seatLimit !== void 0) {
      values.seatLimit = user.seatLimit;
      updateSet.seatLimit = user.seatLimit;
    } else {
      values.seatLimit = 1;
    }
    if (user.isActive !== void 0) {
      values.isActive = user.isActive;
      updateSet.isActive = user.isActive;
    } else {
      values.isActive = false;
    }
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    const nextEmail = typeof values.email === "string" ? values.email.trim().toLowerCase() : null;
    const nextPhone = typeof values.phone === "string" ? values.phone.trim() : null;
    if (nextEmail) {
      const dup = await db.select({ id: users.id }).from(users).where(and(sql`LOWER(${users.email}) = ${nextEmail}`, sql`${users.openId} <> ${user.openId}`)).limit(1);
      if (dup.length > 0) throw new Error("EMAIL_ALREADY_IN_USE");
    }
    if (nextPhone) {
      const dup = await db.select({ id: users.id }).from(users).where(and(eq(users.phone, nextPhone), sql`${users.openId} <> ${user.openId}`)).limit(1);
      if (dup.length > 0) throw new Error("PHONE_ALREADY_IN_USE");
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Using in-memory storage for user lookup:", openId);
    return inMemoryUsers.get(openId);
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getUserByEmail(email) {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return void 0;
  const db = await getDb();
  if (!db) {
    for (const u of inMemoryUsers.values()) {
      const value = typeof u?.email === "string" ? u.email.trim() : "";
      if (value && value.toLowerCase() === normalized.toLowerCase()) return u;
    }
    return void 0;
  }
  const rows = await db.select().from(users).where(sql`LOWER(${users.email}) = ${normalized}`).limit(1);
  return rows[0] ?? void 0;
}
async function getUserById(userId) {
  const db = await getDb();
  if (!db) {
    for (const u of inMemoryUsers.values()) {
      if (u?.id === userId) return u;
    }
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0];
}
async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}
async function setUserActive(userId, isActive) {
  const db = await getDb();
  if (!db) {
    for (const [openId, user] of inMemoryUsers.entries()) {
      if (user?.id === userId) {
        inMemoryUsers.set(openId, {
          ...user,
          isActive,
          updatedAt: /* @__PURE__ */ new Date()
        });
        return;
      }
    }
    throw new Error("User not found");
  }
  await db.update(users).set({ isActive }).where(eq(users.id, userId));
}
async function setUserSubscriptionPlan(params) {
  const db = await getDb();
  if (!db) {
    for (const [openId, user] of inMemoryUsers.entries()) {
      if (user?.id === params.userId) {
        inMemoryUsers.set(openId, {
          ...user,
          subscriptionPlan: params.subscriptionPlan,
          accountType: params.accountType,
          seatLimit: params.seatLimit,
          updatedAt: /* @__PURE__ */ new Date()
        });
        return;
      }
    }
    throw new Error("User not found");
  }
  await db.update(users).set({
    subscriptionPlan: params.subscriptionPlan,
    accountType: params.accountType,
    seatLimit: params.seatLimit
  }).where(eq(users.id, params.userId));
}
async function createClient(client) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clients).values(client);
  return result[0].insertId;
}
async function updateClient(id, client) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clients).set(client).where(eq(clients.id, id));
}
async function deleteClient(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(clients).where(eq(clients.id, id));
}
async function getClientByPortalToken(token) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(clients).where(eq(clients.portalToken, token)).limit(1);
  const client = result[0];
  if (!client) return void 0;
  if (client.portalEnabled !== true) return void 0;
  return client;
}
async function getSharedDocumentsByClientId(clientId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documents).where(
    and(
      eq(documents.clientId, clientId),
      eq(documents.isSharedWithClient, true),
      or(eq(documents.isTemplate, false), sql`(${documents.isTemplate} IS NULL)`)
    )
  ).orderBy(desc(documents.createdAt));
}
async function getClientCount() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: count() }).from(clients);
  return result[0]?.count ?? 0;
}
async function listClientIdsByUserId(userId) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ id: clients.id }).from(clients).where(eq(clients.createdById, userId));
  return rows.map((r) => r.id);
}
async function listCaseIdsByUserId(userId) {
  const db = await getDb();
  if (!db) return [];
  const clientIds = await listClientIdsByUserId(userId);
  if (clientIds.length === 0) return [];
  const rows = await db.select({ id: cases.id }).from(cases).where(or(...clientIds.map((id) => eq(cases.clientId, id))));
  return rows.map((r) => r.id);
}
async function getAllClientsByUserId(userId, search) {
  const db = await getDb();
  if (!db) return [];
  const base = eq(clients.createdById, userId);
  if (search) {
    return db.select().from(clients).where(
      and(
        base,
        or(
          like(clients.name, `%${search}%`),
          like(clients.email, `%${search}%`),
          like(clients.phone, `%${search}%`)
        )
      )
    ).orderBy(desc(clients.createdAt));
  }
  return db.select().from(clients).where(base).orderBy(desc(clients.createdAt));
}
async function getClientByIdForUser(userId, id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(clients).where(and(eq(clients.id, id), eq(clients.createdById, userId))).limit(1);
  return result[0];
}
async function createCase(caseData) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(cases).values(caseData);
  return result[0].insertId;
}
async function updateCase(id, caseData) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(cases).set(caseData).where(eq(cases.id, id));
}
async function deleteCase(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(cases).where(eq(cases.id, id));
}
async function getCaseById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(cases).where(eq(cases.id, id)).limit(1);
  return result[0];
}
async function getAllCasesByUserId(userId, filters) {
  const db = await getDb();
  if (!db) return [];
  const clientIds = await listClientIdsByUserId(userId);
  if (clientIds.length === 0) return [];
  const conditions = [or(...clientIds.map((id) => eq(cases.clientId, id)))];
  if (filters?.status) {
    conditions.push(eq(cases.status, filters.status));
  }
  if (filters?.type) {
    conditions.push(eq(cases.type, filters.type));
  }
  if (filters?.search) {
    conditions.push(
      or(
        like(cases.caseNumber, `%${filters.search}%`),
        like(cases.title, `%${filters.search}%`)
      )
    );
  }
  return db.select().from(cases).where(and(...conditions)).orderBy(desc(cases.createdAt));
}
async function getCasesByClientIdForUser(userId, clientId) {
  const owned = await getClientByIdForUser(userId, clientId);
  if (!owned) return [];
  return getCasesByClientId(clientId);
}
async function getCaseByIdForUser(userId, id) {
  const row = await getCaseById(id);
  if (!row) return void 0;
  const owned = await getClientByIdForUser(userId, Number(row.clientId));
  if (!owned) return void 0;
  return row;
}
async function getCasesByClientId(clientId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cases).where(eq(cases.clientId, clientId)).orderBy(desc(cases.createdAt));
}
async function getCaseStats() {
  const db = await getDb();
  if (!db) return { total: 0, active: 0, won: 0, lost: 0, pending: 0 };
  const total = await db.select({ count: count() }).from(cases);
  const active = await db.select({ count: count() }).from(cases).where(eq(cases.status, "active"));
  const won = await db.select({ count: count() }).from(cases).where(eq(cases.status, "won"));
  const lost = await db.select({ count: count() }).from(cases).where(eq(cases.status, "lost"));
  const pending = await db.select({ count: count() }).from(cases).where(eq(cases.status, "pending"));
  return {
    total: total[0]?.count ?? 0,
    active: active[0]?.count ?? 0,
    won: won[0]?.count ?? 0,
    lost: lost[0]?.count ?? 0,
    pending: pending[0]?.count ?? 0
  };
}
async function getCaseStatsForUser(userId) {
  const list = await getAllCasesByUserId(userId);
  let total = 0;
  let active = 0;
  let won = 0;
  let lost = 0;
  let pending = 0;
  for (const c of list) {
    total += 1;
    if (c.status === "active") active += 1;
    if (c.status === "won") won += 1;
    if (c.status === "lost") lost += 1;
    if (c.status === "pending") pending += 1;
  }
  return { total, active, won, lost, pending };
}
async function createHearing(hearing) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(hearings).values(hearing);
  return result[0].insertId;
}
async function updateHearing(id, hearing) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(hearings).set(hearing).where(eq(hearings.id, id));
}
async function deleteHearing(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(hearings).where(eq(hearings.id, id));
}
async function getHearingsByCaseId(caseId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(hearings).where(eq(hearings.caseId, caseId)).orderBy(desc(hearings.hearingDate));
}
async function getHearingsByClientId(clientId) {
  const db = await getDb();
  if (!db) return [];
  const clientCases = await db.select({ id: cases.id }).from(cases).where(eq(cases.clientId, clientId));
  const ids = clientCases.map((c) => c.id);
  if (ids.length === 0) return [];
  return db.select().from(hearings).where(or(...ids.map((id) => eq(hearings.caseId, id)))).orderBy(desc(hearings.hearingDate));
}
async function getUpcomingHearings(days = 7) {
  const db = await getDb();
  if (!db) return [];
  const now = /* @__PURE__ */ new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1e3);
  return db.select().from(hearings).where(and(
    gte(hearings.hearingDate, now),
    lte(hearings.hearingDate, future),
    eq(hearings.status, "scheduled")
  )).orderBy(hearings.hearingDate);
}
async function getUpcomingHearingsForUser(userId, days = 7) {
  const db = await getDb();
  if (!db) return [];
  const caseIds = await listCaseIdsByUserId(userId);
  if (caseIds.length === 0) return [];
  const now = /* @__PURE__ */ new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1e3);
  return db.select().from(hearings).where(
    and(
      or(...caseIds.map((id) => eq(hearings.caseId, id))),
      gte(hearings.hearingDate, now),
      lte(hearings.hearingDate, future),
      eq(hearings.status, "scheduled")
    )
  ).orderBy(hearings.hearingDate);
}
async function getHearingsByDateRangeForUser(userId, startDate, endDate) {
  const db = await getDb();
  if (!db) return [];
  const caseIds = await listCaseIdsByUserId(userId);
  if (caseIds.length === 0) return [];
  const conditions = [or(...caseIds.map((id) => eq(hearings.caseId, id)))];
  if (startDate) conditions.push(gte(hearings.hearingDate, startDate));
  if (endDate) conditions.push(lte(hearings.hearingDate, endDate));
  return db.select().from(hearings).where(and(...conditions)).orderBy(hearings.hearingDate);
}
async function getHearingById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(hearings).where(eq(hearings.id, id)).limit(1);
  return result[0];
}
async function getHearingByIdForUser(userId, id) {
  const hearing = await getHearingById(id);
  if (!hearing) return void 0;
  const ownedCase = await getCaseByIdForUser(userId, Number(hearing.caseId));
  if (!ownedCase) return void 0;
  return hearing;
}
async function createDocument(doc) {
  const db = await getDb();
  if (!db) {
    const id = Date.now();
    const now = /* @__PURE__ */ new Date();
    inMemoryDocuments.set(id, {
      id,
      ...doc,
      createdAt: doc.createdAt ?? now,
      updatedAt: doc.updatedAt ?? now
    });
    return id;
  }
  const result = await db.insert(documents).values(doc);
  return result[0].insertId;
}
async function updateDocument(id, doc) {
  const db = await getDb();
  if (!db) {
    const existing = inMemoryDocuments.get(id);
    if (!existing) throw new Error("Document not found");
    inMemoryDocuments.set(id, {
      ...existing,
      ...doc,
      updatedAt: /* @__PURE__ */ new Date()
    });
    return;
  }
  await db.update(documents).set(doc).where(eq(documents.id, id));
}
async function deleteDocument(id) {
  const db = await getDb();
  if (!db) {
    inMemoryDocuments.delete(id);
    return;
  }
  await db.delete(documents).where(eq(documents.id, id));
}
async function getDocumentById(id) {
  const db = await getDb();
  if (!db) return inMemoryDocuments.get(id);
  const result = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return result[0];
}
async function getAllDocumentsForUser(userId, search) {
  const db = await getDb();
  if (!db) return [];
  const base = eq(documents.uploadedById, userId);
  if (search) {
    return db.select().from(documents).where(and(base, like(documents.name, `%${search}%`))).orderBy(desc(documents.createdAt));
  }
  return db.select().from(documents).where(base).orderBy(desc(documents.createdAt));
}
async function getDocumentByIdForUser(userId, id) {
  const doc = await getDocumentById(id);
  if (!doc) return void 0;
  if (Number(doc.uploadedById) !== userId) return void 0;
  return doc;
}
async function getDocumentsByCaseIdForUser(userId, caseId) {
  const ownedCase = await getCaseByIdForUser(userId, caseId);
  if (!ownedCase) return [];
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documents).where(and(eq(documents.caseId, caseId), eq(documents.uploadedById, userId))).orderBy(desc(documents.createdAt));
}
async function getDocumentsByClientIdForUser(userId, clientId) {
  const ownedClient = await getClientByIdForUser(userId, clientId);
  if (!ownedClient) return [];
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documents).where(and(eq(documents.clientId, clientId), eq(documents.uploadedById, userId))).orderBy(desc(documents.createdAt));
}
async function getDocumentTemplatesForUser(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documents).where(and(eq(documents.isTemplate, true), eq(documents.uploadedById, userId))).orderBy(desc(documents.createdAt));
}
async function createServiceProject(project) {
  const db = await getDb();
  if (!db) {
    const id = Date.now();
    const now = /* @__PURE__ */ new Date();
    inMemoryServiceProjects.set(id, {
      id,
      ...project,
      createdAt: project.createdAt ?? now,
      updatedAt: project.updatedAt ?? now
    });
    return id;
  }
  const result = await db.insert(serviceProjects).values(project);
  return result[0].insertId;
}
async function updateServiceProject(id, data) {
  const db = await getDb();
  if (!db) {
    const existing = inMemoryServiceProjects.get(id);
    if (!existing) throw new Error("Service project not found");
    inMemoryServiceProjects.set(id, {
      ...existing,
      ...data,
      updatedAt: /* @__PURE__ */ new Date()
    });
    return;
  }
  await db.update(serviceProjects).set(data).where(eq(serviceProjects.id, id));
}
async function deleteServiceProject(id) {
  const db = await getDb();
  if (!db) {
    inMemoryServiceProjects.delete(id);
    for (const [eid, e] of inMemoryServiceProjectExpenses.entries()) {
      if (e?.serviceProjectId === id) inMemoryServiceProjectExpenses.delete(eid);
    }
    return;
  }
  await db.delete(serviceProjectExpenses).where(eq(serviceProjectExpenses.serviceProjectId, id));
  await db.delete(serviceProjects).where(eq(serviceProjects.id, id));
}
async function getServiceProjectById(id) {
  const db = await getDb();
  if (!db) return inMemoryServiceProjects.get(id);
  const rows = await db.select().from(serviceProjects).where(eq(serviceProjects.id, id)).limit(1);
  return rows[0];
}
async function listServiceProjectsByOrganizationId(params) {
  const db = await getDb();
  const { organizationId, status, search } = params;
  if (!db) {
    const all = Array.from(inMemoryServiceProjects.values()).filter((p) => p?.organizationId === organizationId).filter((p) => status ? p?.status === status : true).filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return String(p?.title ?? "").toLowerCase().includes(q);
    }).sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime());
    return all;
  }
  const conditions = [eq(serviceProjects.organizationId, organizationId)];
  if (status) conditions.push(eq(serviceProjects.status, status));
  if (search && search.trim()) {
    conditions.push(like(serviceProjects.title, `%${search.trim()}%`));
  }
  return db.select().from(serviceProjects).where(and(...conditions)).orderBy(desc(serviceProjects.updatedAt));
}
async function createServiceProjectExpense(expense) {
  const db = await getDb();
  if (!db) {
    const id = Date.now();
    inMemoryServiceProjectExpenses.set(id, {
      id,
      ...expense,
      createdAt: expense.createdAt ?? /* @__PURE__ */ new Date()
    });
    return id;
  }
  const result = await db.insert(serviceProjectExpenses).values(expense);
  return result[0].insertId;
}
async function listServiceProjectExpenses(serviceProjectId) {
  const db = await getDb();
  if (!db) {
    return Array.from(inMemoryServiceProjectExpenses.values()).filter((e) => e?.serviceProjectId === serviceProjectId).sort((a, b) => new Date(b.expenseDate ?? b.createdAt).getTime() - new Date(a.expenseDate ?? a.createdAt).getTime());
  }
  return db.select().from(serviceProjectExpenses).where(eq(serviceProjectExpenses.serviceProjectId, serviceProjectId)).orderBy(desc(serviceProjectExpenses.expenseDate));
}
async function deleteServiceProjectExpense(id) {
  const db = await getDb();
  if (!db) {
    inMemoryServiceProjectExpenses.delete(id);
    return;
  }
  await db.delete(serviceProjectExpenses).where(eq(serviceProjectExpenses.id, id));
}
async function createTask(task) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tasks).values(task);
  return result[0].insertId;
}
async function updateTask(id, task) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tasks).set(task).where(eq(tasks.id, id));
}
async function deleteTask(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(tasks).where(eq(tasks.id, id));
}
async function getTasksByUserId(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).where(eq(tasks.assignedToId, userId)).orderBy(desc(tasks.createdAt));
}
async function getTasksByCaseId(caseId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).where(eq(tasks.caseId, caseId)).orderBy(desc(tasks.createdAt));
}
async function getAllTasksForUser(userId, filters) {
  const db = await getDb();
  if (!db) return [];
  const owner = or(eq(tasks.assignedById, userId), eq(tasks.assignedToId, userId));
  const conditions = [owner];
  if (filters?.status) conditions.push(eq(tasks.status, filters.status));
  if (filters?.priority) conditions.push(eq(tasks.priority, filters.priority));
  return db.select().from(tasks).where(and(...conditions)).orderBy(desc(tasks.createdAt));
}
async function getTaskById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return rows[0];
}
async function getTaskByIdForUser(userId, id) {
  const task = await getTaskById(id);
  if (!task) return void 0;
  const ok = Number(task.assignedById) === userId || Number(task.assignedToId) === userId;
  if (!ok) return void 0;
  return task;
}
async function createInvoice(invoice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(invoices).values(invoice);
  return result[0].insertId;
}
async function updateInvoice(id, invoice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(invoices).set(invoice).where(eq(invoices.id, id));
}
async function deleteInvoice(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(invoices).where(eq(invoices.id, id));
}
async function getInvoicesByClientId(clientId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(invoices).where(eq(invoices.clientId, clientId)).orderBy(desc(invoices.createdAt));
}
async function getAllInvoicesForUser(userId, status) {
  const db = await getDb();
  if (!db) return [];
  const base = eq(invoices.createdById, userId);
  if (status) {
    return db.select().from(invoices).where(and(base, eq(invoices.status, status))).orderBy(desc(invoices.createdAt));
  }
  return db.select().from(invoices).where(base).orderBy(desc(invoices.createdAt));
}
async function getInvoiceByIdForUser(userId, id) {
  const db = await getDb();
  if (!db) return void 0;
  const rows = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.createdById, userId))).limit(1);
  return rows[0];
}
async function getInvoicesByClientIdForUser(userId, clientId) {
  const ownedClient = await getClientByIdForUser(userId, clientId);
  if (!ownedClient) return [];
  const db = await getDb();
  if (!db) return [];
  return db.select().from(invoices).where(and(eq(invoices.clientId, clientId), eq(invoices.createdById, userId))).orderBy(desc(invoices.createdAt));
}
async function getInvoiceStats() {
  const db = await getDb();
  if (!db) return { total: 0, paid: 0, pending: 0, overdue: 0, totalAmount: 0, paidAmount: 0 };
  const allInvoices = await db.select().from(invoices);
  let total = 0, paid = 0, pending = 0, overdue = 0, totalAmount = 0, paidAmount = 0;
  allInvoices.forEach((inv) => {
    total++;
    totalAmount += inv.totalAmount ?? 0;
    if (inv.status === "paid") {
      paid++;
      paidAmount += inv.paidAmount ?? 0;
    } else if (inv.status === "overdue") {
      overdue++;
    } else if (inv.status === "sent" || inv.status === "partial") {
      pending++;
    }
  });
  return { total, paid, pending, overdue, totalAmount, paidAmount };
}
async function getInvoiceStatsForUser(userId) {
  const db = await getDb();
  if (!db) return { total: 0, paid: 0, pending: 0, overdue: 0, totalAmount: 0, paidAmount: 0 };
  const allInvoices = await db.select().from(invoices).where(eq(invoices.createdById, userId));
  let total = 0, paid = 0, pending = 0, overdue = 0, totalAmount = 0, paidAmount = 0;
  allInvoices.forEach((inv) => {
    total++;
    totalAmount += inv.totalAmount ?? 0;
    if (inv.status === "paid") {
      paid++;
      paidAmount += inv.paidAmount ?? 0;
    } else if (inv.status === "overdue") {
      overdue++;
    } else if (inv.status === "sent" || inv.status === "partial") {
      pending++;
    }
  });
  return { total, paid, pending, overdue, totalAmount, paidAmount };
}
async function createPayment(payment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(payments).values(payment);
  return result[0].insertId;
}
async function getPaymentsByInvoiceId(invoiceId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(payments).where(eq(payments.invoiceId, invoiceId)).orderBy(desc(payments.paidAt));
}
async function getPaymentsByInvoiceIdForUser(userId, invoiceId) {
  const invoice = await getInvoiceByIdForUser(userId, invoiceId);
  if (!invoice) return [];
  return getPaymentsByInvoiceId(invoiceId);
}
async function getPaymentsByClientId(clientId) {
  const db = await getDb();
  if (!db) return [];
  const inv = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.clientId, clientId));
  const ids = inv.map((i) => i.id);
  if (ids.length === 0) return [];
  return db.select().from(payments).where(or(...ids.map((id) => eq(payments.invoiceId, id)))).orderBy(desc(payments.paidAt));
}
async function createCalendarEvent(event) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(calendarEvents).values(event);
  return result[0].insertId;
}
async function updateCalendarEvent(id, event) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(calendarEvents).set(event).where(eq(calendarEvents.id, id));
}
async function deleteCalendarEvent(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
}
async function getCalendarEventsByDateRangeForUser(userId, startDate, endDate) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(calendarEvents).where(
    and(
      eq(calendarEvents.userId, userId),
      gte(calendarEvents.startTime, startDate),
      lte(calendarEvents.startTime, endDate)
    )
  ).orderBy(calendarEvents.startTime);
}
async function getCalendarEventByIdForUser(userId, id) {
  const db = await getDb();
  if (!db) return void 0;
  const rows = await db.select().from(calendarEvents).where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId))).limit(1);
  return rows[0];
}
async function createCommunicationLog(log) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(communicationLogs).values(log);
  return result[0].insertId;
}
async function getCommunicationLogsByClientIdForUser(userId, clientId) {
  const ownedClient = await getClientByIdForUser(userId, clientId);
  if (!ownedClient) return [];
  const db = await getDb();
  if (!db) return [];
  return db.select().from(communicationLogs).where(and(eq(communicationLogs.clientId, clientId), eq(communicationLogs.userId, userId))).orderBy(desc(communicationLogs.contactedAt));
}
async function createAiChatMessage(message) {
  const db = await getDb();
  if (!db) {
    console.log("[DB] Using in-memory storage for AI chat message");
    const g = globalThis;
    const inMemoryMessages = g.aiChatMessages || (g.aiChatMessages = []);
    const newMessage = {
      ...message,
      id: Date.now(),
      createdAt: /* @__PURE__ */ new Date()
    };
    inMemoryMessages.push(newMessage);
    console.log("[DB] AI chat message created successfully in memory");
    return newMessage.id;
  }
  console.log("[DB] Creating AI chat message for user:", message.userId);
  const result = await db.insert(aiChatHistory).values(message);
  console.log("[DB] AI chat message created successfully");
  return result[0].insertId;
}
async function getAiChatHistory(userId, sessionId) {
  const db = await getDb();
  if (!db) {
    console.log("[DB] Using in-memory storage for AI chat history");
    const g = globalThis;
    const inMemoryMessages = g.aiChatMessages || [];
    return inMemoryMessages.filter((msg) => msg.userId === userId && msg.sessionId === sessionId).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }
  return db.select().from(aiChatHistory).where(and(
    eq(aiChatHistory.userId, userId),
    eq(aiChatHistory.sessionId, sessionId)
  )).orderBy(aiChatHistory.createdAt);
}
async function getAiChatSessions(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ sessionId: aiChatHistory.sessionId, createdAt: aiChatHistory.createdAt }).from(aiChatHistory).where(eq(aiChatHistory.userId, userId)).groupBy(aiChatHistory.sessionId).orderBy(desc(aiChatHistory.createdAt));
}
async function createNotification(notification) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(notifications).values(notification);
  return result[0].insertId;
}
async function getNotificationsByUserId(userId, unreadOnly = false) {
  const db = await getDb();
  if (!db) return [];
  if (unreadOnly) {
    return db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false))).orderBy(desc(notifications.createdAt));
  }
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
}
async function markNotificationAsReadForUser(userId, id) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}
async function markAllNotificationsAsRead(userId) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
}
async function createTimeEntry(entry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(timeEntries).values(entry);
  return result[0].insertId;
}
async function getTimeEntriesByCaseIdForUser(userId, caseId) {
  const ownedCase = await getCaseByIdForUser(userId, caseId);
  if (!ownedCase) return [];
  const db = await getDb();
  if (!db) return [];
  return db.select().from(timeEntries).where(and(eq(timeEntries.caseId, caseId), eq(timeEntries.userId, userId))).orderBy(desc(timeEntries.entryDate));
}
async function getTimeEntriesByUserId(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(timeEntries).where(eq(timeEntries.userId, userId)).orderBy(desc(timeEntries.entryDate));
}
async function getReportsStats(range) {
  const db = await getDb();
  if (!db) {
    return {
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0,
      totalCases: 0,
      wonCases: 0,
      lostCases: 0,
      totalClients: 0,
      newClients: 0
    };
  }
  const invoiceStats = await getInvoiceStats();
  const caseStats = await getCaseStats();
  const totalClients = await getClientCount();
  const now = /* @__PURE__ */ new Date();
  const start = new Date(now);
  if (range === "week") start.setDate(now.getDate() - 7);
  else if (range === "month") start.setMonth(now.getMonth() - 1);
  else if (range === "quarter") start.setMonth(now.getMonth() - 3);
  else if (range === "year") start.setFullYear(now.getFullYear() - 1);
  else start.setMonth(now.getMonth() - 1);
  const newClientsResult = await db.select({ count: count() }).from(clients).where(gte(clients.createdAt, start));
  const totalRevenue = invoiceStats.paidAmount;
  const totalExpenses = 0;
  const netProfit = totalRevenue - totalExpenses;
  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    totalCases: caseStats.total,
    wonCases: caseStats.won,
    lostCases: caseStats.lost,
    totalClients,
    newClients: newClientsResult[0]?.count ?? 0
  };
}
async function getReportsStatsForUser(userId, range) {
  const db = await getDb();
  if (!db) {
    return {
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0,
      totalCases: 0,
      wonCases: 0,
      lostCases: 0,
      totalClients: 0,
      newClients: 0
    };
  }
  const invoiceStats = await getInvoiceStatsForUser(userId);
  const caseStats = await getCaseStatsForUser(userId);
  const totalClientsResult = await db.select({ count: count() }).from(clients).where(eq(clients.createdById, userId));
  const totalClients = totalClientsResult[0]?.count ?? 0;
  const now = /* @__PURE__ */ new Date();
  const start = new Date(now);
  if (range === "week") start.setDate(now.getDate() - 7);
  else if (range === "month") start.setMonth(now.getMonth() - 1);
  else if (range === "quarter") start.setMonth(now.getMonth() - 3);
  else if (range === "year") start.setFullYear(now.getFullYear() - 1);
  else start.setMonth(now.getMonth() - 1);
  const newClientsResult = await db.select({ count: count() }).from(clients).where(and(eq(clients.createdById, userId), gte(clients.createdAt, start)));
  const totalRevenue = invoiceStats.paidAmount;
  const totalExpenses = 0;
  const netProfit = totalRevenue - totalExpenses;
  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    totalCases: caseStats.total,
    wonCases: caseStats.won,
    lostCases: caseStats.lost,
    totalClients,
    newClients: newClientsResult[0]?.count ?? 0
  };
}
async function getDashboardStats() {
  const db = await getDb();
  if (!db) return {
    totalCases: 0,
    activeCases: 0,
    totalClients: 0,
    upcomingHearings: 0,
    pendingTasks: 0,
    unpaidInvoices: 0,
    winRate: 0,
    totalRevenue: 0,
    wonCases: 0,
    lostCases: 0,
    pendingCases: 0
  };
  const caseStats = await getCaseStats();
  const clientCount = await getClientCount();
  const upcoming = await getUpcomingHearings(7);
  const pendingTasksResult = await db.select({ count: count() }).from(tasks).where(eq(tasks.status, "pending"));
  const invoiceStats = await getInvoiceStats();
  const winRate = caseStats.total > 0 ? Math.round(caseStats.won / (caseStats.won + caseStats.lost || 1) * 100) : 0;
  return {
    totalCases: caseStats.total,
    activeCases: caseStats.active,
    totalClients: clientCount,
    upcomingHearings: upcoming.length,
    pendingTasks: pendingTasksResult[0]?.count ?? 0,
    unpaidInvoices: invoiceStats.pending + invoiceStats.overdue,
    winRate,
    totalRevenue: invoiceStats.paidAmount,
    wonCases: caseStats.won,
    lostCases: caseStats.lost,
    pendingCases: caseStats.pending
  };
}
async function getDashboardStatsForUser(userId) {
  const db = await getDb();
  if (!db)
    return {
      totalCases: 0,
      activeCases: 0,
      totalClients: 0,
      upcomingHearings: 0,
      pendingTasks: 0,
      unpaidInvoices: 0,
      winRate: 0,
      totalRevenue: 0,
      wonCases: 0,
      lostCases: 0,
      pendingCases: 0
    };
  const caseStats = await getCaseStatsForUser(userId);
  const clientCountResult = await db.select({ count: count() }).from(clients).where(eq(clients.createdById, userId));
  const clientCount = clientCountResult[0]?.count ?? 0;
  const upcoming = await getUpcomingHearingsForUser(userId, 7);
  const pendingTasksResult = await db.select({ count: count() }).from(tasks).where(
    and(
      eq(tasks.status, "pending"),
      or(eq(tasks.assignedById, userId), eq(tasks.assignedToId, userId))
    )
  );
  const invoiceStats = await getInvoiceStatsForUser(userId);
  const winRate = caseStats.total > 0 ? Math.round(caseStats.won / (caseStats.won + caseStats.lost || 1) * 100) : 0;
  return {
    totalCases: caseStats.total,
    activeCases: caseStats.active,
    totalClients: clientCount,
    upcomingHearings: upcoming.length,
    pendingTasks: pendingTasksResult[0]?.count ?? 0,
    unpaidInvoices: invoiceStats.pending + invoiceStats.overdue,
    winRate,
    totalRevenue: invoiceStats.paidAmount,
    wonCases: caseStats.won,
    lostCases: caseStats.lost,
    pendingCases: caseStats.pending
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.log(
        "[OAuth] INFO: OAUTH_SERVER_URL is not configured - using local authentication only"
      );
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    console.log("[Auth] Cookie secret length:", secret.length, "First chars:", secret.substring(0, 3) + "...");
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      if (!secretKey || secretKey.length === 0) {
        console.error("[Auth] Cookie secret is not configured - check JWT_SECRET environment variable");
        return null;
      }
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      console.log("[Auth] Found Bearer token in header");
      try {
        const session2 = await this.verifySession(token);
        if (session2) {
          const sessionUserId2 = session2.openId;
          const signedInAt2 = /* @__PURE__ */ new Date();
          let user2 = await getUserByOpenId(sessionUserId2);
          if (!user2) {
            if (sessionUserId2.startsWith("local-")) {
              console.log("[Auth] Creating local user for:", sessionUserId2);
              await upsertUser({
                openId: sessionUserId2,
                name: session2.name,
                email: null,
                loginMethod: "local",
                lastSignedIn: signedInAt2
              });
              user2 = await getUserByOpenId(sessionUserId2);
            } else {
              throw ForbiddenError("User not found");
            }
          }
          if (!user2) {
            throw ForbiddenError("User not found");
          }
          await upsertUser({
            openId: user2.openId,
            lastSignedIn: signedInAt2
          });
          return user2;
        }
      } catch (error) {
        console.error("[Auth] Bearer token verification failed", error);
      }
    }
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      console.error("[Auth] Session verification failed");
      throw ForbiddenError("Invalid session cookie");
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      if (sessionUserId.startsWith("local-")) {
        console.log("[Auth] Creating local user for:", sessionUserId);
        await upsertUser({
          openId: sessionUserId,
          name: session.name,
          email: null,
          // We don't have email from session
          loginMethod: "local",
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(sessionUserId);
      } else {
        try {
          console.log("[Auth] Syncing user from OAuth for:", sessionUserId);
          const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
          await upsertUser({
            openId: userInfo.openId,
            name: userInfo.name || null,
            email: userInfo.email ?? null,
            loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
            lastSignedIn: signedInAt
          });
          user = await getUserByOpenId(userInfo.openId);
        } catch (error) {
          console.error("[Auth] Failed to sync user from OAuth:", error);
          throw ForbiddenError("Failed to sync user info");
        }
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var sdk = new SDKServer();

// server/_core/oauth.ts
function registerOAuthRoutes(app) {
  const getFrontendOrigin = (req) => {
    const fromEnv = (process.env.FRONTEND_URL ?? "").trim();
    if (fromEnv) return fromEnv.replace(/\/+$/, "");
    const originHeader = (req.get("origin") ?? "").trim();
    const refererHeader = (req.get("referer") ?? "").trim();
    const candidate = originHeader || refererHeader;
    if (candidate) {
      try {
        const u = new URL(candidate);
        return `${u.protocol}//${u.host}`;
      } catch {
      }
    }
    return process.env.NODE_ENV === "production" ? "https://mawazen.netlify.app" : "http://localhost:5173";
  };
  const wantsHtml = (req) => {
    const accept = (req.get("accept") ?? "").toLowerCase();
    return accept.includes("text/html");
  };
  const redirectWithError = (req, res, path4, error) => {
    const frontendOrigin = getFrontendOrigin(req);
    const qs = new URLSearchParams();
    qs.set("error", error);
    if (path4 === "/signup") {
      const mode = typeof req.body.mode === "string" ? req.body.mode : "";
      if (mode === "trial" || mode === "pay") qs.set("mode", mode);
    }
    res.redirect(302, `${frontendOrigin}${path4}?${qs.toString()}`);
  };
  const getSafeRedirectPath = (req) => {
    const redirect = typeof req.body.redirect === "string" ? req.body.redirect : "";
    return redirect.startsWith("/") ? redirect : "";
  };
  const getBackendOrigin = (req) => {
    const fromEnv = (ENV.backendUrl ?? "").trim();
    if (fromEnv) return fromEnv.replace(/\/+$/, "");
    return `${req.protocol}://${req.get("host")}`;
  };
  const encodeState = (value) => {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  };
  const decodeState = (value) => {
    try {
      return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    } catch {
      return null;
    }
  };
  app.post("/api/auth/firebase", async (req, res) => {
    console.log("[Auth] Processing Firebase token exchange");
    try {
      const { idToken, profile } = req.body;
      if (!idToken) {
        return res.status(400).json({ success: false, message: "Missing idToken" });
      }
      const adminAuth = getFirebaseAdmin().auth();
      const decodedToken = await adminAuth.verifyIdToken(idToken);
      const { uid, email, name, picture } = decodedToken;
      const openId = `firebase-${uid}`;
      await upsertUser({
        openId,
        name: profile?.name || name || null,
        email: email || null,
        avatarUrl: picture || null,
        phone: profile?.phone || null,
        organizationName: profile?.organizationName || null,
        loginMethod: "firebase",
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      await ensureUserHasOrganization({
        openId,
        defaultOrganizationName: profile?.organizationName || name || "My Organization"
      });
      const sessionToken = await sdk.createSessionToken(openId, {
        name: name ?? "",
        expiresInMs: ONE_YEAR_MS
      });
      return res.json({
        success: true,
        data: {
          token: sessionToken,
          user: { openId, email, name }
        }
      });
    } catch (error) {
      console.error("Firebase Admin Verification Error:", error);
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Firebase token verification failed"
      });
    }
  });
  app.get("/api/oauth/google", async (req, res) => {
    if (!ENV.googleOAuthClientId || !ENV.googleOAuthClientSecret) {
      res.status(500).send("Google OAuth is not configured");
      return;
    }
    const redirect = typeof req.query.redirect === "string" ? req.query.redirect : "";
    const safeRedirect = redirect.startsWith("/") ? redirect : "";
    const backendOrigin = getBackendOrigin(req);
    const redirectUri = `${backendOrigin}/api/oauth/google/callback`;
    const state = encodeState({ redirect: safeRedirect });
    const params = new URLSearchParams();
    params.set("client_id", ENV.googleOAuthClientId);
    params.set("redirect_uri", redirectUri);
    params.set("response_type", "code");
    params.set("scope", "openid email profile");
    params.set("state", state);
    params.set("prompt", "select_account");
    res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });
  app.get("/api/oauth/google/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const stateRaw = typeof req.query.state === "string" ? req.query.state : "";
    const error = typeof req.query.error === "string" ? req.query.error : "";
    const state = stateRaw ? decodeState(stateRaw) : null;
    const safeRedirect = typeof state?.redirect === "string" && state.redirect.startsWith("/") ? state.redirect : "";
    if (error) {
      const frontendOrigin = getFrontendOrigin(req);
      res.redirect(302, `${frontendOrigin}/login`);
      return;
    }
    if (!code || !ENV.googleOAuthClientId || !ENV.googleOAuthClientSecret) {
      const frontendOrigin = getFrontendOrigin(req);
      res.redirect(302, `${frontendOrigin}/login`);
      return;
    }
    try {
      const backendOrigin = getBackendOrigin(req);
      const redirectUri = `${backendOrigin}/api/oauth/google/callback`;
      const tokenParams = new URLSearchParams();
      tokenParams.set("code", code);
      tokenParams.set("client_id", ENV.googleOAuthClientId);
      tokenParams.set("client_secret", ENV.googleOAuthClientSecret);
      tokenParams.set("redirect_uri", redirectUri);
      tokenParams.set("grant_type", "authorization_code");
      const tokenRes = await axios2.post(
        "https://oauth2.googleapis.com/token",
        tokenParams.toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 15e3
        }
      );
      const accessToken = String(tokenRes.data?.access_token ?? "");
      const idToken = String(tokenRes.data?.id_token ?? "");
      if (!accessToken || !idToken) throw new Error("Missing Google tokens");
      const userInfoRes = await axios2.get("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15e3
      });
      const sub = String(userInfoRes.data?.sub ?? "");
      const name = String(userInfoRes.data?.name ?? "").trim() || null;
      const email = String(userInfoRes.data?.email ?? "").trim().toLowerCase() || null;
      const avatarUrl = String(userInfoRes.data?.picture ?? "").trim() || null;
      if (!sub) throw new Error("Missing Google user id");
      const existingByEmail = email ? await getUserByEmail(email) : void 0;
      const openId = existingByEmail?.openId ?? `google-${sub}`;
      await upsertUser({
        openId,
        name,
        email,
        avatarUrl,
        loginMethod: "google",
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      await ensureUserHasOrganization({
        openId,
        defaultOrganizationName: name
      });
      const sessionToken = await sdk.createSessionToken(openId, {
        name: name ?? "",
        expiresInMs: ONE_YEAR_MS
      });
      const frontendOrigin = getFrontendOrigin(req);
      const redirectQuery = safeRedirect ? `&redirect=${encodeURIComponent(safeRedirect)}` : "";
      res.redirect(302, `${frontendOrigin}?token=${sessionToken}${redirectQuery}`);
    } catch (e) {
      const frontendOrigin = getFrontendOrigin(req);
      res.redirect(302, `${frontendOrigin}/login`);
    }
  });
  app.get("/api/local-login", (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 - \u0645\u0648\u0627\u0632\u064A\u0646</title>
        <style>
          body { 
            font-family: 'Tajawal', 'Cairo', Arial, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            margin: 0; 
            padding: 20px;
          }
          .login-container {
            background: white;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            width: 100%;
            max-width: 400px;
          }
          .logo {
            text-align: center;
            margin-bottom: 30px;
            font-size: 32px;
            font-weight: bold;
            color: #D4AF37;
          }
          .form-group { margin-bottom: 20px; }
          label { 
            display: block; 
            margin-bottom: 8px; 
            font-weight: 500;
            color: #333;
          }
          input { 
            width: 100%; 
            padding: 12px 16px; 
            border: 2px solid #e1e5e9; 
            border-radius: 8px; 
            font-size: 16px;
            transition: border-color 0.3s;
          }
          input:focus {
            outline: none;
            border-color: #D4AF37;
          }
          button { 
            background: linear-gradient(135deg, #D4AF37, #B8941F); 
            color: white; 
            padding: 14px 24px; 
            border: none; 
            border-radius: 8px; 
            cursor: pointer; 
            font-size: 16px;
            font-weight: 600;
            width: 100%;
            transition: transform 0.2s;
          }
          button:hover { 
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(212, 175, 55, 0.3);
          }
          .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
          }
        </style>
      </head>
      <body>
        <div class="login-container">
          <div class="logo">\u0645\u0648\u0627\u0632\u064A\u0646</div>
          <p class="subtitle">\u0627\u0644\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064A \u0627\u0644\u0630\u0643\u064A</p>
          <form method="post" action="/api/local-login">
            <div class="form-group">
              <label for="name">\u0627\u0644\u0627\u0633\u0645:</label>
              <input type="text" id="name" name="name" value="\u0645\u0633\u062A\u062E\u062F\u0645 \u062A\u062C\u0631\u064A\u0628\u064A" required>
            </div>
            <div class="form-group">
              <label for="email">\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A:</label>
              <input type="email" id="email" name="email" value="test@example.com" required>
            </div>
            <button type="submit">\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644</button>
          </form>
        </div>
      </body>
      </html>
    `);
  });
  app.post("/api/local-login", async (req, res) => {
    console.log("[Local Login] Processing local login");
    try {
      const name = req.body.name || "\u0645\u0633\u062A\u062E\u062F\u0645 \u062A\u062C\u0631\u064A\u0628\u064A";
      const email = typeof req.body.email === "string" && req.body.email.trim() ? req.body.email.trim().toLowerCase() : "test@example.com";
      let openId = `local-${email.replace(/[^a-zA-Z0-9]/g, "")}`;
      const existingByEmail = await getUserByEmail(email);
      if (existingByEmail?.openId) {
        openId = existingByEmail.openId;
      }
      const testUserInfo = {
        openId,
        name,
        email,
        loginMethod: "local"
      };
      await upsertUser({
        openId: testUserInfo.openId,
        name: testUserInfo.name,
        email: testUserInfo.email,
        loginMethod: testUserInfo.loginMethod,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: ONE_YEAR_MS
      });
      const frontendOrigin = getFrontendOrigin(req);
      res.redirect(302, `${frontendOrigin}?token=${sessionToken}`);
    } catch (e) {
      console.error("[Local Login] Error:", e);
      const frontendOrigin = getFrontendOrigin(req);
      res.redirect(302, `${frontendOrigin}/login`);
    }
  });
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    return {
      httpOnly: true,
      path: "/",
      sameSite: "none",
      // Required for cross-origin
      secure: true,
      // Required for cross-origin
      domain: void 0
      // Let browser handle it automatically
    };
  }
  const isLocalhost = req.hostname === "localhost" || req.hostname === "127.0.0.1";
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req) && !isLocalhost
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);
var ownerProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user) {
      throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (!ENV.ownerOpenId) {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    if (ctx.user.openId !== ENV.ownerOpenId) {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { z as z2 } from "zod";
import axios4 from "axios";

// server/_core/llm.ts
var resolveProvider = () => {
  const geminiKey = ENV.geminiApiKey ? ENV.geminiApiKey.trim() : "";
  if (geminiKey) return "gemini";
  const p = (ENV.llmProvider ?? "").trim().toLowerCase();
  if (p === "gemini") return "gemini";
  if (p === "forge") return "forge";
  if (p === "openai") return "openai";
  const openaiKey = getValidOpenAiKey();
  if (openaiKey.length > 0) return "openai";
  return "forge";
};
var assertGeminiKey = () => {
  const k = ENV.geminiApiKey ? ENV.geminiApiKey.trim() : "";
  if (!k) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
};
var buildGeminiPrompt = (messages) => {
  return messages.map((m) => {
    const content = ensureArray(m.content).map((p) => typeof p === "string" ? p : p.type === "text" ? p.text : "").filter(Boolean).join("\n");
    return `[${m.role}]
${content}`.trim();
  }).join("\n\n");
};
var fetchWithTimeout = async (url, init, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};
var isGeminiModelNotFound = (status, bodyText) => {
  if (status !== 404) return false;
  const lower = (bodyText || "").toLowerCase();
  return lower.includes("models/") && (lower.includes("not found") || lower.includes("listmodels"));
};
var cachedGeminiModelId = null;
var normalizeGeminiModelId = (raw) => {
  const m = (raw ?? "").trim();
  if (!m) return "";
  return m.startsWith("models/") ? m.slice("models/".length) : m;
};
var listGeminiModels = async (apiKey) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
    apiKey
  )}`;
  const res = await fetchWithTimeout(url, { method: "GET" }, 15e3);
  const text2 = await res.text();
  if (!res.ok) {
    throw new Error(`Gemini ListModels failed: ${res.status} ${res.statusText} \u2013 ${text2}`);
  }
  try {
    return JSON.parse(text2);
  } catch {
    throw new Error(`Gemini ListModels returned non-JSON response: ${text2}`);
  }
};
var pickGeminiModelFromList = (listResponse) => {
  const models = Array.isArray(listResponse?.models) ? listResponse.models : [];
  const candidates = models.filter((m) => Array.isArray(m?.supportedGenerationMethods)).filter((m) => m.supportedGenerationMethods.includes("generateContent"));
  const score = (name) => {
    const id = normalizeGeminiModelId(name).toLowerCase();
    if (id.includes("1.5") && id.includes("flash")) return 100;
    if (id.includes("1.5") && id.includes("pro")) return 90;
    if (id === "gemini-pro") return 80;
    if (id.startsWith("gemini")) return 70;
    return 0;
  };
  const best = candidates.map((m) => String(m?.name || "")).filter(Boolean).sort((a, b) => score(b) - score(a))[0];
  return normalizeGeminiModelId(best || "");
};
var pickGeminiModelCandidatesFromList = (listResponse, max) => {
  const models = Array.isArray(listResponse?.models) ? listResponse.models : [];
  const candidates = models.filter((m) => Array.isArray(m?.supportedGenerationMethods)).filter((m) => m.supportedGenerationMethods.includes("generateContent")).map((m) => normalizeGeminiModelId(String(m?.name || ""))).filter(Boolean);
  const score = (id) => {
    const lower = id.toLowerCase();
    if (lower.includes("2.5") && lower.includes("flash")) return 120;
    if (lower.includes("2") && lower.includes("flash")) return 110;
    if (lower.includes("1.5") && lower.includes("flash")) return 100;
    if (lower.includes("2.5") && lower.includes("pro")) return 95;
    if (lower.includes("2") && lower.includes("pro")) return 90;
    if (lower.includes("1.5") && lower.includes("pro")) return 85;
    if (lower === "gemini-pro") return 80;
    if (lower.startsWith("gemini")) return 70;
    return 0;
  };
  const unique = Array.from(new Set(candidates));
  return unique.sort((a, b) => score(b) - score(a)).slice(0, Math.max(1, max));
};
var callGeminiGenerateContent = async (args) => {
  const { apiKey, modelId, prompt } = args;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelId
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.2
    }
  };
  let response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      },
      2e4
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const error = new Error(`Gemini invoke failed: request_error \u2013 ${msg}`);
    error.status = 0;
    error.bodyText = msg;
    throw error;
  }
  const bodyText = await response.text();
  if (!response.ok) {
    const error = new Error(
      `Gemini invoke failed: ${response.status} ${response.statusText} \u2013 ${bodyText}`
    );
    error.status = response.status;
    error.bodyText = bodyText;
    throw error;
  }
  const data = JSON.parse(bodyText);
  const text2 = data?.candidates?.[0]?.content?.parts?.map((p) => typeof p?.text === "string" ? p.text : "").filter(Boolean).join("\n") ?? "";
  return { text: text2, usedModelId: modelId };
};
var invokeGemini = async (params) => {
  assertGeminiKey();
  const apiKey = ENV.geminiApiKey.trim();
  const configuredModelId = normalizeGeminiModelId(ENV.geminiModel ?? "");
  const prompt = buildGeminiPrompt(params.messages);
  const cachedModelId = cachedGeminiModelId ? normalizeGeminiModelId(cachedGeminiModelId) : "";
  const presetModels = [
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash",
    "gemini-1.5-pro-latest",
    "gemini-1.5-pro",
    "gemini-pro"
  ];
  const modelAttempts = Array.from(
    new Set(
      [configuredModelId, cachedModelId, ...configuredModelId ? presetModels : []].map(normalizeGeminiModelId).filter(Boolean)
    )
  );
  console.log("[LLM][Gemini] configuredModelId:", configuredModelId || "(empty)");
  console.log("[LLM][Gemini] cachedModelId:", cachedModelId || "(empty)");
  console.log("[LLM][Gemini] modelAttempts:", modelAttempts.filter(Boolean));
  let usedModelId = "";
  let text2 = "";
  if (!configuredModelId && !cachedModelId) {
    const list = await listGeminiModels(apiKey);
    const picked = pickGeminiModelFromList(list);
    const pickedCandidates = pickGeminiModelCandidatesFromList(list, 6);
    const listCandidates = Array.from(new Set([picked, ...pickedCandidates].filter(Boolean)));
    if (listCandidates.length === 0) {
      throw new Error("Gemini ListModels did not return any model supporting generateContent");
    }
    console.log("[LLM][Gemini] ListModels candidates:", listCandidates);
    let lastError;
    for (const modelId of listCandidates) {
      try {
        console.log("[LLM][Gemini] trying ListModels model:", modelId);
        const out = await callGeminiGenerateContent({ apiKey, modelId, prompt });
        usedModelId = out.usedModelId;
        text2 = out.text;
        cachedGeminiModelId = usedModelId;
        console.log("[LLM][Gemini] success ListModels model:", usedModelId);
        lastError = void 0;
        break;
      } catch (e) {
        lastError = e;
        const err = e;
        const status = typeof err?.status === "number" ? err.status : 0;
        const bodyText = typeof err?.bodyText === "string" ? err.bodyText : String(err?.message || "");
        if (!isGeminiModelNotFound(status, bodyText)) {
          throw e;
        }
      }
    }
    if (!usedModelId) {
      throw lastError instanceof Error ? lastError : new Error("Gemini invoke failed after ListModels fallback");
    }
  }
  for (const modelId of modelAttempts) {
    if (!modelId) continue;
    try {
      console.log("[LLM][Gemini] trying model:", modelId);
      const out = await callGeminiGenerateContent({ apiKey, modelId, prompt });
      usedModelId = out.usedModelId;
      text2 = out.text;
      cachedGeminiModelId = usedModelId;
      console.log("[LLM][Gemini] success model:", usedModelId);
      break;
    } catch (e) {
      const err = e;
      const status = typeof err?.status === "number" ? err.status : 0;
      const bodyText = typeof err?.bodyText === "string" ? err.bodyText : String(err?.message || "");
      if (isGeminiModelNotFound(status, bodyText)) {
        if (cachedGeminiModelId && normalizeGeminiModelId(modelId) === normalizeGeminiModelId(cachedGeminiModelId)) {
          cachedGeminiModelId = null;
        }
        console.log("[LLM][Gemini] model not found:", modelId, "status:", status);
      } else {
        console.warn("[LLM][Gemini] model failed:", modelId, "status:", status);
      }
      if (!isGeminiModelNotFound(status, bodyText)) {
        throw e;
      }
    }
  }
  if (!usedModelId) {
    console.log("[LLM][Gemini] all preset models failed; calling ListModels...");
    const list = await listGeminiModels(apiKey);
    const picked = pickGeminiModelFromList(list);
    const pickedCandidates = pickGeminiModelCandidatesFromList(list, 6);
    const listCandidates = Array.from(new Set([picked, ...pickedCandidates].filter(Boolean)));
    if (listCandidates.length === 0) {
      throw new Error("Gemini ListModels did not return any model supporting generateContent");
    }
    console.log("[LLM][Gemini] ListModels candidates:", listCandidates);
    let lastError;
    for (const modelId of listCandidates) {
      try {
        console.log("[LLM][Gemini] trying ListModels model:", modelId);
        const out = await callGeminiGenerateContent({ apiKey, modelId, prompt });
        usedModelId = out.usedModelId;
        text2 = out.text;
        cachedGeminiModelId = usedModelId;
        console.log("[LLM][Gemini] success ListModels model:", usedModelId);
        lastError = void 0;
        break;
      } catch (e) {
        lastError = e;
        const err = e;
        const status = typeof err?.status === "number" ? err.status : 0;
        const bodyText = typeof err?.bodyText === "string" ? err.bodyText : String(err?.message || "");
        if (isGeminiModelNotFound(status, bodyText)) {
          console.log("[LLM][Gemini] ListModels model not found:", modelId, "status:", status);
        } else {
          console.warn("[LLM][Gemini] ListModels model failed:", modelId, "status:", status);
        }
        if (!isGeminiModelNotFound(status, bodyText)) {
          throw e;
        }
      }
    }
    if (!usedModelId) {
      throw lastError instanceof Error ? lastError : new Error("Gemini invoke failed after ListModels fallback");
    }
  }
  const created = Math.floor(Date.now() / 1e3);
  return {
    id: `gemini_${created}`,
    created,
    model: usedModelId,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text2 || "\u0639\u0630\u0631\u0627\u064B\u060C \u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0645\u0639\u0627\u0644\u062C\u0629 \u0637\u0644\u0628\u0643."
        },
        finish_reason: "stop"
      }
    ],
    usage: void 0
  };
};
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var getValidOpenAiKey = () => {
  const raw = ENV.openaiApiKey ? ENV.openaiApiKey.trim() : "";
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower.includes("sk-your-") || lower.includes("your-openai-api-key") || lower.includes("sk-your-openai-api-key-here")) {
    return "";
  }
  return raw;
};
var resolveApiUrl = (provider) => provider === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://forge.manus.im/v1/chat/completions";
var assertApiKey = (provider) => {
  if (provider === "gemini") {
    assertGeminiKey();
    return;
  }
  const openaiKey = getValidOpenAiKey();
  const forgeKey = ENV.forgeApiKey ? ENV.forgeApiKey.trim() : "";
  if (provider === "openai") {
    if (!openaiKey) throw new Error("OPENAI_API_KEY is not configured");
    return;
  }
  if (provider === "forge") {
    if (!forgeKey) throw new Error("FORGE_API_KEY is not configured");
    return;
  }
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return void 0;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
    }
  };
};
async function invokeLLM(params) {
  console.log("[LLM] Starting invokeLLM");
  const provider = resolveProvider();
  assertApiKey(provider);
  console.log("[LLM] API key check passed");
  if (provider === "gemini") {
    console.log("[LLM] Provider: gemini");
    return invokeGemini(params);
  }
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format
  } = params;
  const payload = {
    model: "gpt-4o-mini",
    messages: messages.map(normalizeMessage)
  };
  console.log("[LLM] Payload created with model:", payload.model);
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  payload.max_tokens = 16384;
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const apiUrl = resolveApiUrl(provider);
  console.log("[LLM] Calling API URL:", apiUrl);
  const openaiKey = getValidOpenAiKey();
  const forgeKey = ENV.forgeApiKey ? ENV.forgeApiKey.trim() : "";
  console.log("[LLM] Using OpenAI key:", !!openaiKey);
  console.log("[LLM] Provider:", provider);
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider === "openai" ? openaiKey : forgeKey}`
    },
    body: JSON.stringify(payload)
  });
  console.log("[LLM] Response status:", response.status, response.statusText);
  if (!response.ok) {
    const errorText = await response.text();
    console.error("[LLM] Error response:", errorText);
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  const result = await response.json();
  console.log("[LLM] Success - choices count:", result.choices?.length);
  return result;
}

// server/routers.ts
import { nanoid } from "nanoid";
import { TRPCError as TRPCError3 } from "@trpc/server";

// server/legalEmbeddings.ts
function resolveEmbeddingsApiUrl() {
  if (!ENV.openaiApiKey || ENV.openaiApiKey.trim().length === 0) {
    throw new Error("OPENAI_API_KEY is required for embeddings");
  }
  return "https://api.openai.com/v1/embeddings";
}
async function embedTexts(texts) {
  if (texts.length === 0) return [];
  const url = resolveEmbeddingsApiUrl();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.openaiApiKey}`
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Embeddings request failed: ${response.status} ${response.statusText}${detail ? ` \u2013 ${detail}` : ""}`);
  }
  const payload = await response.json();
  return (payload.data ?? []).map((d) => d.embedding ?? []);
}
async function embedText(text2) {
  const vectors = await embedTexts([text2]);
  return vectors[0] ?? [];
}

// server/legalRetrieval.ts
import axios3 from "axios";
import https from "https";
async function withTimeout(promise, ms, label) {
  let t2;
  const timeout = new Promise((_, reject) => {
    t2 = setTimeout(() => reject(new Error(`timeout:${label}:${ms}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (t2) clearTimeout(t2);
  }
}
function isInsecureTlsAllowedForUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "laws.boe.gov.sa" || host.endsWith(".boe.gov.sa")) return true;
    if (host === "duckduckgo.com" || host.endsWith(".duckduckgo.com")) return true;
    if (host === "www.googleapis.com") return true;
    return false;
  } catch {
    return false;
  }
}
async function httpGetText(url, headers) {
  const f = globalThis?.fetch;
  if (typeof f === "function") {
    try {
      const res = await f(url, { headers, redirect: "follow" });
      return {
        ok: !!res?.ok,
        status: Number(res?.status ?? 0),
        text: async () => String(await res.text())
      };
    } catch (e) {
      if (ENV.legalRetrievalDebug) {
        console.warn("[LegalRetrieval] fetch error", {
          url,
          message: e instanceof Error ? e.message : String(e)
        });
      }
    }
  }
  try {
    const insecure = ENV.legalRetrievalInsecureTls && isInsecureTlsAllowedForUrl(url);
    const res = await axios3.get(url, {
      headers,
      maxRedirects: 5,
      timeout: 12e3,
      responseType: "text",
      httpsAgent: insecure ? new https.Agent({ rejectUnauthorized: false }) : void 0,
      validateStatus: () => true
    });
    if (ENV.legalRetrievalDebug && !(res.status >= 200 && res.status < 300)) {
      console.warn("[LegalRetrieval] HTTP non-2xx", { url, status: res.status });
    }
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      text: async () => String(res.data ?? "")
    };
  } catch (e) {
    if (ENV.legalRetrievalDebug) {
      console.warn("[LegalRetrieval] HTTP error", {
        url,
        message: e instanceof Error ? e.message : String(e)
      });
    }
    return {
      ok: false,
      status: 0,
      text: async () => ""
    };
  }
}
function safeJsonParse(value, fallback) {
  if (typeof value !== "string" || value.trim().length === 0) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
function norm(a) {
  return Math.sqrt(dot(a, a));
}
function cosineSimilarity(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  return dot(a, b) / (na * nb);
}
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeDigits(input) {
  return String(input ?? "").replace(/[٠-٩]/g, (d) => {
    const map = {
      "\u0660": "0",
      "\u0661": "1",
      "\u0662": "2",
      "\u0663": "3",
      "\u0664": "4",
      "\u0665": "5",
      "\u0666": "6",
      "\u0667": "7",
      "\u0668": "8",
      "\u0669": "9"
    };
    return map[d] ?? d;
  });
}
function isArticleTextQuery(query) {
  const q = normalizeDigits(String(query ?? "")).replace(/[\u200f\u200e]/g, " ").replace(/\s+/g, " ").trim();
  return /(نص\s*المادة|تنص\s*المادة|(?:ال)?ماد(?:ة|ه)\s*\d{1,4}|لماد(?:ة|ه)\s*\d{1,4})/.test(q);
}
function extractArticleNumber(query) {
  const q = normalizeDigits(String(query ?? ""));
  const m = q.match(/(?:المادة|ماده|مادة|لمادة)\s*(?:رقم\s*)?[:(\[]?\s*([0-9]{1,4})/);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function ordinalUnder100(n) {
  if (!Number.isFinite(n) || n <= 0 || n >= 100) return null;
  const units = {
    1: "\u0627\u0644\u0623\u0648\u0644\u0649",
    2: "\u0627\u0644\u062B\u0627\u0646\u064A\u0629",
    3: "\u0627\u0644\u062B\u0627\u0644\u062B\u0629",
    4: "\u0627\u0644\u0631\u0627\u0628\u0639\u0629",
    5: "\u0627\u0644\u062E\u0627\u0645\u0633\u0629",
    6: "\u0627\u0644\u0633\u0627\u062F\u0633\u0629",
    7: "\u0627\u0644\u0633\u0627\u0628\u0639\u0629",
    8: "\u0627\u0644\u062B\u0627\u0645\u0646\u0629",
    9: "\u0627\u0644\u062A\u0627\u0633\u0639\u0629"
  };
  if (n <= 9) return units[n] ?? null;
  if (n === 10) return "\u0627\u0644\u0639\u0627\u0634\u0631\u0629";
  if (n >= 11 && n <= 19) {
    const u2 = n - 10;
    const teenUnits = {
      1: "\u0627\u0644\u062D\u0627\u062F\u064A\u0629 \u0639\u0634\u0631\u0629",
      2: "\u0627\u0644\u062B\u0627\u0646\u064A\u0629 \u0639\u0634\u0631\u0629",
      3: "\u0627\u0644\u062B\u0627\u0644\u062B\u0629 \u0639\u0634\u0631\u0629",
      4: "\u0627\u0644\u0631\u0627\u0628\u0639\u0629 \u0639\u0634\u0631\u0629",
      5: "\u0627\u0644\u062E\u0627\u0645\u0633\u0629 \u0639\u0634\u0631\u0629",
      6: "\u0627\u0644\u0633\u0627\u062F\u0633\u0629 \u0639\u0634\u0631\u0629",
      7: "\u0627\u0644\u0633\u0627\u0628\u0639\u0629 \u0639\u0634\u0631\u0629",
      8: "\u0627\u0644\u062B\u0627\u0645\u0646\u0629 \u0639\u0634\u0631\u0629",
      9: "\u0627\u0644\u062A\u0627\u0633\u0639\u0629 \u0639\u0634\u0631\u0629"
    };
    return teenUnits[u2] ?? null;
  }
  const tensBase = {
    20: "\u0627\u0644\u0639\u0634\u0631\u0648\u0646",
    30: "\u0627\u0644\u062B\u0644\u0627\u062B\u0648\u0646",
    40: "\u0627\u0644\u0623\u0631\u0628\u0639\u0648\u0646",
    50: "\u0627\u0644\u062E\u0645\u0633\u0648\u0646",
    60: "\u0627\u0644\u0633\u062A\u0648\u0646",
    70: "\u0627\u0644\u0633\u0628\u0639\u0648\u0646",
    80: "\u0627\u0644\u062B\u0645\u0627\u0646\u0648\u0646",
    90: "\u0627\u0644\u062A\u0633\u0639\u0648\u0646"
  };
  const t2 = Math.floor(n / 10) * 10;
  const u = n % 10;
  if (u === 0) return tensBase[t2] ?? null;
  const prefix = {
    1: "\u0627\u0644\u062D\u0627\u062F\u064A\u0629",
    2: "\u0627\u0644\u062B\u0627\u0646\u064A\u0629",
    3: "\u0627\u0644\u062B\u0627\u0644\u062B\u0629",
    4: "\u0627\u0644\u0631\u0627\u0628\u0639\u0629",
    5: "\u0627\u0644\u062E\u0627\u0645\u0633\u0629",
    6: "\u0627\u0644\u0633\u0627\u062F\u0633\u0629",
    7: "\u0627\u0644\u0633\u0627\u0628\u0639\u0629",
    8: "\u0627\u0644\u062B\u0627\u0645\u0646\u0629",
    9: "\u0627\u0644\u062A\u0627\u0633\u0639\u0629"
  };
  const p = prefix[u];
  const tb = tensBase[t2];
  if (!p || !tb) return null;
  return `${p} \u0648${tb}`.replace(" \u0648", " \u0648");
}
function articleLabelBoeStyle(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 100) return ordinalUnder100(n);
  if (n === 100) return "\u0627\u0644\u0645\u0627\u0626\u0629";
  if (n > 100 && n < 200) {
    const under = ordinalUnder100(n - 100);
    if (!under) return null;
    return `${under} \u0628\u0639\u062F \u0627\u0644\u0645\u0627\u0626\u0629`;
  }
  if (n === 200) return "\u0627\u0644\u0645\u0627\u0626\u062A\u064A\u0646";
  if (n > 200 && n < 300) {
    const under = ordinalUnder100(n - 200);
    if (!under) return null;
    return `${under} \u0628\u0639\u062F \u0627\u0644\u0645\u0627\u0626\u062A\u064A\u0646`;
  }
  return null;
}
function toHostLabel(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "WEB";
  }
}
function isAllowedWebFallbackHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === "laws.boe.gov.sa") return true;
  if (h.endsWith(".boe.gov.sa")) return true;
  if (h === "mohr.gov.sa" || h.endsWith(".mohr.gov.sa")) return true;
  if (h === "hrsd.gov.sa" || h.endsWith(".hrsd.gov.sa")) return true;
  if (h === "almrj3.com" || h.endsWith(".almrj3.com")) return true;
  if (h === "elmokhtarlaw.com" || h.endsWith(".elmokhtarlaw.com")) return true;
  if (h === "saudi-lawyers.net" || h.endsWith(".saudi-lawyers.net")) return true;
  return false;
}
function looksLikeRequestedArticleText(params) {
  const text2 = String(params.text ?? "");
  if (!text2.trim()) return false;
  const n = params.articleNumber;
  const boeLabel = params.boeLabel;
  if (boeLabel) {
    const labelPattern = escapeRegex(boeLabel).replace(/\s+/g, "\\s+");
    const re = new RegExp(`\u0627\u0644\u0645\u0627\u062F\u0629\\s*(?:[\\(\\[]\\s*)?${labelPattern}(?:\\s*[\\)\\]])?`);
    if (re.test(text2)) return true;
  }
  const reNum = new RegExp(`\u0627\u0644\u0645\u0627\u062F\u0629\\s*(?:[\\(\\[]\\s*)?${n}(?:\\s*[\\)\\]])?(?:\\s*[:\uFF1A])?`);
  return reNum.test(text2);
}
function extractDuckDuckGoResultUrls(html) {
  const urls = [];
  const seen = /* @__PURE__ */ new Set();
  const patterns = [
    // class before href
    /<a[^>]+class=(?:"|')([^"']*\bresult__a\b[^"']*)(?:"|')[^>]+href=(?:"|')([^"']+)(?:"|')/gi,
    // href before class
    /<a[^>]+href=(?:"|')([^"']+)(?:"|')[^>]+class=(?:"|')([^"']*\bresult__a\b[^"']*)(?:"|')/gi
  ];
  const rawHrefs = [];
  for (const re of patterns) {
    for (const m of html.matchAll(re)) {
      const href = (m[2] ?? m[1] ?? "").trim();
      if (href) rawHrefs.push(href);
    }
  }
  for (let href of rawHrefs) {
    href = href.trim();
    if (!href) continue;
    href = href.replace(/&amp;/g, "&");
    if (href.startsWith("//")) href = `https:${href}`;
    if (href.startsWith("/")) href = `https://duckduckgo.com${href}`;
    try {
      const u = new URL(href);
      if (u.hostname.endsWith("duckduckgo.com") && u.pathname.startsWith("/l/")) {
        const uddg = u.searchParams.get("uddg");
        if (uddg) href = decodeURIComponent(uddg);
      }
    } catch {
    }
    if (!href) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    urls.push(href);
    if (urls.length >= 15) break;
  }
  return urls;
}
function extractGoogleResultUrls(jsonText) {
  try {
    const data = JSON.parse(jsonText);
    const items = Array.isArray(data?.items) ? data.items : [];
    const urls = [];
    for (const it of items) {
      const link = typeof it?.link === "string" ? it.link.trim() : "";
      if (!link) continue;
      urls.push(link);
      if (urls.length >= 8) break;
    }
    return urls;
  } catch {
    return [];
  }
}
async function googleSearchArticleSnippet(params) {
  const q = String(params.query ?? "").trim();
  if (!q) return null;
  if (!isArticleTextQuery(q)) return null;
  if (!ENV.googleApiKey || !ENV.googleCseId) return null;
  const n = params.articleNumber;
  const boeLabel = articleLabelBoeStyle(n);
  const expandedQuery = n === 1 ? `\u0646\u0635 \u0627\u0644\u0645\u0627\u062F\u0629 \u0627\u0644\u0623\u0648\u0644\u0649 \u0645\u0646 \u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644 \u062A\u0633\u0631\u064A \u0623\u062D\u0643\u0627\u0645 \u0647\u0630\u0627 \u0627\u0644\u0646\u0638\u0627\u0645` : boeLabel ? `${q} \u0627\u0644\u0645\u0627\u062F\u0629 ${boeLabel} \u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644` : q;
  const apiUrl = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(ENV.googleApiKey)}&cx=${encodeURIComponent(ENV.googleCseId)}&q=${encodeURIComponent(expandedQuery)}`;
  try {
    const res = await httpGetText(apiUrl, {
      accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
      "user-agent": ENV.legalCrawlerUserAgent
    });
    if (!res.ok) return null;
    const jsonText = await res.text();
    const candidates = extractGoogleResultUrls(jsonText);
    for (const u of candidates) {
      let host = "";
      try {
        host = new URL(u).hostname;
      } catch {
        continue;
      }
      if (!isAllowedWebFallbackHost(host)) continue;
      const pageRes = await httpGetText(u, {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": ENV.legalCrawlerUserAgent
      });
      if (!pageRes.ok) continue;
      const pageHtml = await pageRes.text();
      const plain = pageHtml.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<\s*br\s*\/?\s*>/gi, "\n").replace(/<\s*\/?p\s*>/gi, "\n").replace(/<\s*\/?div\s*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[\t\r]+/g, " ").replace(/ {2,}/g, " ").trim();
      const patterns = [];
      if (boeLabel) {
        const labelPattern = escapeRegex(boeLabel).replace(/\s+/g, "\\s+");
        patterns.push(new RegExp(`\u0627\u0644\u0645\u0627\u062F\u0629\\s*(?:[([]\\s*)?${labelPattern}(?:\\s*[)]])?\\s*:?([\\s\\S]*?)(?=\\s*\u0627\u0644\u0645\u0627\u062F\u0629\\s*(?:[([]\\s*)?|$)`));
      }
      patterns.push(new RegExp(`\u0627\u0644\u0645\u0627\u062F\u0629\\s*(?:[([]\\s*)?${n}(?:\\s*[)]])?\\s*:?([\\s\\S]*?)(?=\\s*\u0627\u0644\u0645\u0627\u062F\u0629\\s*(?:[([]\\s*)?|$)`));
      for (const re of patterns) {
        const m = plain.match(re);
        if (!m?.[0]) continue;
        const snippetText = String(m[0]).trim().slice(0, 1600);
        if (snippetText.length < 40) continue;
        return {
          text: snippetText,
          score: 0.7,
          source: toHostLabel(u),
          url: u,
          title: null,
          meta: { law: "unknown", article: n }
        };
      }
    }
  } catch {
  }
  return null;
}
async function webSearchArticleSnippet(params) {
  const q = String(params.query ?? "").trim();
  if (!q) return null;
  if (!isArticleTextQuery(q)) return null;
  const laborLawQuery = /نظام\s*العمل|مكتب\s*العمل/.test(q);
  const n = params.articleNumber;
  const boeLabel = articleLabelBoeStyle(n);
  const expandedQuery = n === 1 ? `\u0646\u0635 \u0627\u0644\u0645\u0627\u062F\u0629 \u0627\u0644\u0623\u0648\u0644\u0649 \u0645\u0646 \u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644 \u062A\u0633\u0631\u064A \u0623\u062D\u0643\u0627\u0645 \u0647\u0630\u0627 \u0627\u0644\u0646\u0638\u0627\u0645` : boeLabel ? `${q} \u0627\u0644\u0645\u0627\u062F\u0629 ${boeLabel} \u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644` : q;
  const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(expandedQuery)}`;
  try {
    const res = await httpGetText(searchUrl, {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": ENV.legalCrawlerUserAgent
    });
    if (!res.ok) return null;
    const html = await res.text();
    const candidates = extractDuckDuckGoResultUrls(html);
    for (const u of candidates) {
      let host = "";
      try {
        host = new URL(u).hostname;
      } catch {
        continue;
      }
      if (!isAllowedWebFallbackHost(host)) continue;
      if (laborLawQuery && !u.includes(BOE_LABOR_LAW_ID)) continue;
      const pageRes = await httpGetText(u, {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": ENV.legalCrawlerUserAgent
      });
      if (!pageRes.ok) continue;
      const pageHtml = await pageRes.text();
      const plain = pageHtml.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<\s*br\s*\/?\s*>/gi, "\n").replace(/<\s*\/?p\s*>/gi, "\n").replace(/<\s*\/?div\s*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[\t\r]+/g, " ").replace(/ {2,}/g, " ").trim();
      const patterns = [];
      if (boeLabel) {
        const labelPattern = escapeRegex(boeLabel).replace(/\s+/g, "\\s+");
        patterns.push(
          new RegExp(
            `\u0627\u0644\u0645\u0627\u062F\u0629\\s*(?:[\\(\\[]\\s*)?${labelPattern}(?:\\s*[\\)\\]])?\\s*:?([\\s\\S]*?)(?=\\s*\u0627\u0644\u0645\u0627\u062F\u0629\\s*(?:[\\(\\[]\\s*)?|$)`
          )
        );
      }
      patterns.push(
        new RegExp(
          `\u0627\u0644\u0645\u0627\u062F\u0629\\s*(?:[\\(\\[]\\s*)?${n}(?:\\s*[\\)\\]])?\\s*:?([\\s\\S]*?)(?=\\s*\u0627\u0644\u0645\u0627\u062F\u0629\\s*(?:[\\(\\[]\\s*)?|$)`
        )
      );
      for (const re of patterns) {
        const m = plain.match(re);
        if (!m?.[0]) continue;
        const snippetText = String(m[0]).trim().slice(0, 4e3);
        if (snippetText.length < 40) continue;
        return {
          text: snippetText,
          score: 0.65,
          source: toHostLabel(u),
          url: u,
          title: null,
          meta: { law: "unknown", article: n }
        };
      }
    }
  } catch {
  }
  return null;
}
function buildKeywordTerms(query) {
  const q = String(query ?? "").trim();
  const terms = [];
  const n = extractArticleNumber(q);
  if (n !== null) {
    terms.push(String(n));
    terms.push(`\u0627\u0644\u0645\u0627\u062F\u0629 ${n}`);
    const boe = articleLabelBoeStyle(n);
    if (boe) terms.push(`\u0627\u0644\u0645\u0627\u062F\u0629 ${boe}`);
  }
  if (/مكتب\s*العمل/.test(q) && !/نظام\s*العمل/.test(q)) {
    terms.push("\u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644");
  }
  const tokens = q.replace(/[\u200f\u200e]/g, " ").replace(/[\p{P}\p{S}]+/gu, " ").split(/\s+/).map((t2) => t2.trim()).filter((t2) => t2.length >= 3).slice(0, 8);
  terms.push(...tokens);
  return Array.from(new Set(terms));
}
function scoreTextByTerms(text2, terms) {
  const t2 = String(text2 ?? "");
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (t2.includes(term)) score += 1;
  }
  return score;
}
var BOE_LABOR_LAW_URL = "https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/08381293-6388-48e2-8ad2-a9a700f2aa94/1";
var BOE_LABOR_LAW_ID = "08381293-6388-48e2-8ad2-a9a700f2aa94";
function getStaticBoeLaborLawSnippet(articleNumber) {
  if (articleNumber === 1) {
    const text3 = "\u0627\u0644\u0645\u0627\u062F\u0629 \u0627\u0644\u0623\u0648\u0644\u0649 :\n\u064A\u0633\u0645\u0649 \u0647\u0630\u0627 \u0627\u0644\u0646\u0638\u0627\u0645 \u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644.";
    return {
      text: text3,
      score: 0.95,
      source: "BOE (cached)",
      url: BOE_LABOR_LAW_URL,
      title: "\u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644",
      meta: { law: "labor_law", article: 1 }
    };
  }
  if (articleNumber === 105) {
    const text3 = "\u0627\u0644\u0645\u0627\u062F\u0629 \u0627\u0644\u062E\u0627\u0645\u0633\u0629 \u0628\u0639\u062F \u0627\u0644\u0645\u0627\u0626\u0629 :\n\u0645\u0644\u062E\u0635 \u0639\u0645\u0644\u064A (\u063A\u064A\u0631 \u062D\u0631\u0641\u064A): \u062A\u0633\u0645\u062D \u0628\u062A\u062C\u0645\u064A\u0639 \u0627\u0644\u0631\u0627\u062D\u0627\u062A \u0627\u0644\u0623\u0633\u0628\u0648\u0639\u064A\u0629 \u0644\u0645\u062F\u0629 \u0644\u0627 \u062A\u062A\u062C\u0627\u0648\u0632 (8) \u0623\u0633\u0627\u0628\u064A\u0639 \u0644\u0644\u0639\u0627\u0645\u0644\u064A\u0646 \u0641\u064A \u0623\u0645\u0627\u0643\u0646 \u0628\u0639\u064A\u062F\u0629 \u0639\u0646 \u0627\u0644\u0639\u0645\u0631\u0627\u0646 \u0623\u0648 \u0641\u064A \u0623\u0639\u0645\u0627\u0644 \u062A\u062A\u0637\u0644\u0628 \u0627\u0633\u062A\u0645\u0631\u0627\u0631\u064A\u0629\u060C \u0628\u062D\u064A\u062B \u064A\u062D\u0635\u0644 \u0627\u0644\u0639\u0627\u0645\u0644 \u0639\u0644\u0649 \u0631\u0627\u062D\u0629 \u0645\u062A\u0635\u0644\u0629 \u0644\u0627\u062D\u0642\u0627\u064B \u0628\u062F\u0644\u0627\u064B \u0645\u0646 \u0645\u0646\u062D \u0631\u0627\u062D\u0629 \u0623\u0633\u0628\u0648\u0639\u064A\u0629 \u0643\u0644 \u0623\u0633\u0628\u0648\u0639\u060C \u0648\u0630\u0644\u0643 \u0648\u0641\u0642 \u0636\u0648\u0627\u0628\u0637 \u0645\u0646\u0647\u0627: \u0648\u062C\u0648\u062F \u0627\u062A\u0641\u0627\u0642 \u0645\u0643\u062A\u0648\u0628 \u0628\u064A\u0646 \u0635\u0627\u062D\u0628 \u0627\u0644\u0639\u0645\u0644 \u0648\u0627\u0644\u0639\u0627\u0645\u0644\u060C \u0648\u0645\u0648\u0627\u0641\u0642\u0629 \u0627\u0644\u062C\u0647\u0629 \u0627\u0644\u0645\u062E\u062A\u0635\u0629 (\u0627\u0644\u0648\u0632\u0627\u0631\u0629).";
    return {
      text: text3,
      score: 0.93,
      source: "BOE (cached summary)",
      url: BOE_LABOR_LAW_URL,
      title: "\u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644",
      meta: { law: "labor_law", article: 105 }
    };
  }
  if (articleNumber !== 107) return null;
  const text2 = '\u0627\u0644\u0645\u0627\u062F\u0629 \u0627\u0644\u0633\u0627\u0628\u0639\u0629 \u0628\u0639\u062F \u0627\u0644\u0645\u0627\u0626\u0629 :\n- \u0635\u062F\u0631 \u0627\u0644\u0645\u0631\u0633\u0648\u0645 \u0627\u0644\u0645\u0644\u0643\u064A \u0631\u0642\u0645 (\u0645/44) \u0648\u062A\u0627\u0631\u064A\u062E 1446/2/8\u0647\u0640\u060C \u0648\u0630\u0644\u0643 \u0628\u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u0649 \u062A\u0639\u062F\u064A\u0644\u0627\u062A \u0628\u0639\u0636 \u0645\u0648\u0627\u062F \u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644 (\u0648\u064A\u0639\u0645\u0644 \u0628\u0647\u0627 \u0645\u0646 \u062A\u0627\u0631\u064A\u062E 1446/8/20\u0647\u0640) \u0648\u0639\u062F\u0644\u062A \u0627\u0644\u0641\u0642\u0631\u0629 (1) \u0645\u0646 \u0647\u0630\u0647 \u0627\u0644\u0645\u0627\u062F\u0629 \u0644\u062A\u0643\u0648\u0646 \u0628\u0627\u0644\u0646\u0635 \u0627\u0644\u0622\u062A\u064A: "\u064A\u062C\u0628 \u0639\u0644\u0649 \u0635\u0627\u062D\u0628 \u0627\u0644\u0639\u0645\u0644 \u0623\u0646 \u064A\u062F\u0641\u0639 \u0644\u0644\u0639\u0627\u0645\u0644 \u0623\u062C\u0631\u0627\u064B \u0625\u0636\u0627\u0641\u064A\u0651\u064B\u0627 \u0639\u0646 \u0633\u0627\u0639\u0627\u062A \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0625\u0636\u0627\u0641\u064A\u0629 \u064A\u0648\u0627\u0632\u064A \u0623\u062C\u0631 \u0627\u0644\u0633\u0627\u0639\u0629 \u0645\u0636\u0627\u0641\u0627\u064B \u0625\u0644\u064A\u0647 (50%) \u0645\u0646 \u0623\u062C\u0631\u0647 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u060C \u0648\u064A\u062C\u0648\u0632 \u0644\u0635\u0627\u062D\u0628 \u0627\u0644\u0639\u0645\u0644 \u0628\u0645\u0648\u0627\u0641\u0642\u0629 \u0627\u0644\u0639\u0627\u0645\u0644 \u0623\u0646 \u064A\u062D\u062A\u0633\u0628 \u0644\u0644\u0639\u0627\u0645\u0644 \u0623\u064A\u0627\u0645 \u0625\u062C\u0627\u0632\u0629 \u062A\u0639\u0648\u064A\u0636\u064A\u0629 \u0645\u062F\u0641\u0648\u0639\u0629 \u0627\u0644\u0623\u062C\u0631 \u0628\u062F\u0644\u0627\u064B \u0639\u0646 \u0627\u0644\u0623\u062C\u0631 \u0627\u0644\u0645\u0633\u062A\u062D\u0642 \u0644\u0644\u0639\u0627\u0645\u0644 \u0644\u0633\u0627\u0639\u0627\u062A \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0625\u0636\u0627\u0641\u064A\u0629. \u0648\u062A\u0628\u064A\u0646 \u0627\u0644\u0644\u0627\u0626\u062D\u0629 \u0627\u0644\u0623\u062D\u0643\u0627\u0645 \u0627\u0644\u0645\u062A\u0635\u0644\u0629 \u0628\u0630\u0644\u0643".';
  return {
    text: text2,
    score: 0.94,
    source: "BOE (cached)",
    url: BOE_LABOR_LAW_URL,
    title: "\u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644",
    meta: { law: "labor_law", article: 107 }
  };
}
function extractBoeArticleBlockFromPlain(params) {
  const plain = params.plain;
  const labelPattern = escapeRegex(params.boeLabel).replace(/\s+/g, "\\s+");
  const headingLabel = new RegExp(
    `(?:^|\\n)\\s*\u0627\u0644\u0645\u0627\u062F\u0629\\s*(?:[\\(\\[]\\s*)?${labelPattern}(?:\\s*[\\)\\]])?\\s*[:\uFF1A]`,
    "g"
  );
  const headingNum = new RegExp(
    `(?:^|\\n)\\s*\u0627\u0644\u0645\u0627\u062F\u0629\\s*(?:[\\(\\[]\\s*)?${params.articleNumber}(?:\\s*[\\)\\]])?\\s*[:\uFF1A]`,
    "g"
  );
  const matches = [];
  for (const re of [headingLabel, headingNum]) {
    re.lastIndex = 0;
    const m = re.exec(plain);
    if (m?.index != null) matches.push({ idx: m.index, len: String(m[0]).length });
  }
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.idx - b.idx);
  const start = matches[0].idx;
  const nextHeading = new RegExp(
    `(?:^|\\n)\\s*\u0627\u0644\u0645\u0627\u062F\u0629\\s*(?:[\\(\\[]\\s*)?(?:[0-9]{1,4}|[\u0627\u0623\u0625\u0622\u0621-\u064A][\u0627\u0623\u0625\u0622\u0621-\u064A\\s]{1,80})(?:\\s*[\\)\\]])?\\s*[:\uFF1A]`,
    "g"
  );
  nextHeading.lastIndex = start + matches[0].len;
  const next = nextHeading.exec(plain);
  const end = next?.index != null ? next.index : plain.length;
  const block = plain.slice(start, end).trim();
  if (block.length < 40) return null;
  return block;
}
async function fetchBoeLaborArticleSnippet(params) {
  const boeLabel = articleLabelBoeStyle(params.articleNumber);
  if (!boeLabel) return getStaticBoeLaborLawSnippet(params.articleNumber);
  const url = BOE_LABOR_LAW_URL;
  try {
    const res = await httpGetText(url, {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": ENV.legalCrawlerUserAgent
    });
    if (!res.ok) return getStaticBoeLaborLawSnippet(params.articleNumber);
    const html = await res.text();
    const plain = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<\s*br\s*\/?\s*>/gi, "\n").replace(/<\s*\/?p\s*>/gi, "\n").replace(/<\s*\/?div\s*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[\t\r]+/g, " ").replace(/ {2,}/g, " ").trim();
    const extracted = extractBoeArticleBlockFromPlain({
      plain,
      boeLabel,
      articleNumber: params.articleNumber
    });
    let bestText = extracted;
    if (!bestText) {
      const labelPattern = escapeRegex(boeLabel).replace(/\s+/g, "\\s+");
      const patterns = [
        new RegExp(
          `\u0627\u0644\u0645\u0627\u062F\u0629\\s*(?:[\\(\\[]\\s*)?${labelPattern}(?:\\s*[\\)\\]])?\\s*:?([\\s\\S]*?)(?=\\s*\u0627\u0644\u0645\u0627\u062F\u0629\\s*(?:[\\(\\[]\\s*)?|$)`
        ),
        new RegExp(
          `\u0627\u0644\u0645\u0627\u062F\u0629\\s*(?:[\\(\\[]\\s*)?${params.articleNumber}(?:\\s*[\\)\\]])?\\s*:?([\\s\\S]*?)(?=\\s*\u0627\u0644\u0645\u0627\u062F\u0629\\s*(?:[\\(\\[]\\s*)?|$)`
        )
      ];
      for (const re0 of patterns) {
        const re = new RegExp(re0.source, re0.flags.includes("g") ? re0.flags : `${re0.flags}g`);
        for (const m of plain.matchAll(re)) {
          const t2 = String(m?.[0] ?? "").trim();
          if (t2.length < 40) continue;
          if (!bestText || t2.length > bestText.length) bestText = t2;
        }
      }
    }
    if (!bestText) return getStaticBoeLaborLawSnippet(params.articleNumber);
    const snippetText = bestText.slice(0, 4e3);
    if (snippetText.length < 40) return getStaticBoeLaborLawSnippet(params.articleNumber);
    return {
      text: snippetText,
      score: 0.95,
      source: "BOE",
      url,
      title: "\u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644",
      meta: { law: "labor_law", article: params.articleNumber }
    };
  } catch {
    return getStaticBoeLaborLawSnippet(params.articleNumber);
  }
}
async function retrieveLegalSnippets(params) {
  const topK = params.topK ?? 6;
  const scanLimit = params.scanLimit ?? 400;
  const requestedArticleNumber = extractArticleNumber(params.query);
  const wantsArticleText = requestedArticleNumber !== null && isArticleTextQuery(params.query);
  const requestedBoeLabel = requestedArticleNumber !== null ? articleLabelBoeStyle(requestedArticleNumber) : null;
  if (wantsArticleText && requestedArticleNumber) {
    console.log("[LegalRetrieval] article_query", {
      article: requestedArticleNumber,
      query: params.query
    });
  }
  if (wantsArticleText && requestedArticleNumber && /نظام\s*العمل|مكتب\s*العمل/.test(params.query)) {
    const boeSnippet = await withTimeout(fetchBoeLaborArticleSnippet({ articleNumber: requestedArticleNumber }), 18e3, "boe.labor");
    const isCachedSummary = boeSnippet?.meta?.law === "labor_law" && boeSnippet?.meta?.article === requestedArticleNumber && String(boeSnippet?.source ?? "").includes("cached summary");
    if (boeSnippet && (isCachedSummary || looksLikeRequestedArticleText({
      text: boeSnippet.text,
      articleNumber: requestedArticleNumber,
      boeLabel: requestedBoeLabel
    }))) {
      return [boeSnippet];
    }
  }
  if (wantsArticleText && requestedArticleNumber) {
    console.warn("[LegalRetrieval] no_snippet", {
      article: requestedArticleNumber,
      query: params.query
    });
  }
  const terms = buildKeywordTerms(params.query);
  if (ENV.openaiApiKey && ENV.openaiApiKey.trim().length > 0) {
    try {
      const queryVector = await embedText(params.query);
      if (queryVector.length) {
        const rows = await listLegalChunksWithEmbeddings({ limit: scanLimit });
        const scored = rows.map((r) => {
          const embedding = safeJsonParse(r.embeddingJson, []);
          const score = cosineSimilarity(queryVector, embedding);
          const meta = safeJsonParse(r.metaJson, null);
          return {
            text: String(r.text ?? ""),
            score,
            source: String(r.source ?? (r.document?.source ?? "")),
            url: String(r.url ?? (r.document?.url ?? "")),
            title: r.title ?? (r.document?.title ?? null),
            meta
          };
        }).filter((x) => x.text.trim().length > 0 && x.url.trim().length > 0).sort((a, b) => b.score - a.score).slice(0, topK);
        if (scored.length > 0 && scored[0].score >= 0.2 && (!wantsArticleText || requestedArticleNumber !== null && looksLikeRequestedArticleText({
          text: scored[0].text,
          articleNumber: requestedArticleNumber,
          boeLabel: requestedBoeLabel
        }))) {
          return scored;
        }
      }
    } catch {
    }
  }
  try {
    const rows = await listLegalChunksByTextSearch({ terms, limit: Math.max(scanLimit, topK * 10) });
    const scored = rows.map((r) => {
      const meta = safeJsonParse(r.metaJson, null);
      const score = scoreTextByTerms(String(r.text ?? ""), terms);
      return {
        text: String(r.text ?? ""),
        score,
        source: String(r.source ?? ""),
        url: String(r.url ?? ""),
        title: r.title ?? null,
        meta
      };
    }).filter((x) => x.text.trim().length > 0 && x.url.trim().length > 0).sort((a, b) => b.score - a.score).slice(0, topK);
    if (scored.length > 0 && (!wantsArticleText || requestedArticleNumber !== null && looksLikeRequestedArticleText({
      text: scored[0].text,
      articleNumber: requestedArticleNumber,
      boeLabel: requestedBoeLabel
    }))) {
      return scored;
    }
  } catch {
  }
  if (wantsArticleText && requestedArticleNumber) {
    const n = requestedArticleNumber;
    if (/نظام\s*العمل|مكتب\s*العمل/.test(params.query)) {
      const boeSnippet = await fetchBoeLaborArticleSnippet({ articleNumber: n });
      if (boeSnippet) return [boeSnippet];
    }
    const googleSnippet = await googleSearchArticleSnippet({ query: params.query, articleNumber: n });
    if (googleSnippet) return [googleSnippet];
    const duckduckgoSnippet = await webSearchArticleSnippet({ query: params.query, articleNumber: n });
    if (duckduckgoSnippet) return [duckduckgoSnippet];
  }
  return [];
}
function formatSnippetsForPrompt(snippets) {
  if (snippets.length === 0) {
    return "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0642\u062A\u0637\u0641\u0627\u062A \u0645\u062A\u0627\u062D\u0629 \u062D\u0627\u0644\u064A\u0627\u064B \u0645\u0646 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0645\u0639\u0631\u0641\u0629 \u0627\u0644\u0631\u0633\u0645\u064A\u0629.";
  }
  const lines = [];
  lines.push(
    "\u0645\u0642\u062A\u0637\u0641\u0627\u062A \u0631\u0633\u0645\u064A\u0629 (\u0642\u0627\u0639\u062F\u0629 \u0635\u0627\u0631\u0645\u0629: \u0639\u0646\u062F \u0630\u0643\u0631 \u0645\u0627\u062F\u0629/\u0646\u0635/\u062A\u0627\u0631\u064A\u062E/\u062A\u0639\u0631\u064A\u0641 \u0646\u0638\u0627\u0645\u064A \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0645\u0648\u062C\u0648\u062F\u0627\u064B \u062D\u0631\u0641\u064A\u0627\u064B \u062F\u0627\u062E\u0644 \u0645\u0642\u062A\u0637\u0641 \u0648\u0627\u062D\u062F \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644. \u0627\u0633\u062A\u062E\u062F\u0645 \u0623\u0631\u0642\u0627\u0645 \u0627\u0644\u0645\u0642\u062A\u0637\u0641\u0627\u062A \u0645\u062B\u0644 [1] \u0639\u0646\u062F \u0627\u0644\u0627\u0633\u062A\u0634\u0647\u0627\u062F.):"
  );
  snippets.forEach((s, idx) => {
    const title = s.title ? ` | ${s.title}` : "";
    lines.push(`
[${idx + 1}] \u0627\u0644\u0645\u0635\u062F\u0631: ${s.source}${title}`);
    lines.push(`\u0627\u0644\u0631\u0627\u0628\u0637: ${s.url}`);
    lines.push(`\u0627\u0644\u0645\u0642\u062A\u0637\u0641:
${s.text}`);
  });
  return lines.join("\n");
}

// server/legalCrawler.ts
import { createHash } from "crypto";
function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}
function extractLinksFromHtml(html, baseUrl) {
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const hrefs = Array.from(html.matchAll(/href\s*=\s*"([^"]+)"/gi)).map((m) => m[1]);
  const out = [];
  for (const href of hrefs) {
    const h = (href ?? "").trim();
    if (!h) continue;
    if (h.startsWith("#")) continue;
    if (h.startsWith("javascript:")) continue;
    if (h.startsWith("mailto:")) continue;
    try {
      const u = new URL(h, base);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      if (u.hostname !== base.hostname) continue;
      if (u.pathname.startsWith("/Identity/")) continue;
      if (u.pathname.startsWith("/admin/")) continue;
      const isBoe = u.hostname.toLowerCase() === "laws.boe.gov.sa";
      if (isBoe) {
        if (!u.pathname.startsWith("/BoeLaws/Laws/LawDetails/") && !u.pathname.startsWith("/BoeLaws/Laws/Folders/")) {
          continue;
        }
        if (u.pathname.startsWith("/BoeLaws/Laws/Viewer/")) continue;
      }
      out.push(u.toString());
    } catch {
      continue;
    }
  }
  return Array.from(new Set(out));
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function stripHtml(html) {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withNewlines = withoutScripts.replace(/<\s*br\s*\/?\s*>/gi, "\n").replace(/<\s*\/?p\s*>/gi, "\n").replace(/<\s*\/?div\s*>/gi, "\n").replace(/<\s*\/?li\s*>/gi, "\n");
  const text2 = withNewlines.replace(/<[^>]+>/g, " ");
  return text2.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[\t\r]+/g, " ").replace(/ {2,}/g, " ").trim();
}
function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return stripHtml(m[1]).trim() || null;
}
function inferSource(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("laws.moj.gov.sa")) return "MOJ_LAWS";
    if (host.includes("boe.gov.sa")) return "BOE";
    if (host.includes("cma.org.sa")) return "CMA";
    if (host.includes("cma.gov.sa")) return "CMA";
    if (host.includes("sama.gov.sa")) return "SAMA";
    if (host.includes("zatca.gov.sa")) return "ZATCA";
    if (host.includes("expro.gov.sa")) return "EXPRO";
    if (host.includes("nazaha.gov.sa")) return "NAZAHA";
    return host;
  } catch {
    return "UNKNOWN";
  }
}
async function fetchText(url, headers) {
  const res = await fetch(url, { headers, redirect: "follow" });
  const contentType = res.headers.get("content-type") ?? "";
  const text2 = await res.text();
  return { res, contentType, text: text2 };
}
async function parseSitemapXml(xml) {
  const locs = Array.from(xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)).map((m) => m[1].trim());
  return locs.filter(Boolean);
}
function chunkText(text2, opts) {
  const maxChars = opts?.maxChars ?? 1200;
  const overlapChars = opts?.overlapChars ?? 150;
  const clean = text2.replace(/\s{2,}/g, " ").trim();
  if (!clean) return [];
  const articleHeadingRe = /(^|\n)\s*المادة\s+[^\n:]{1,80}\s*:?/g;
  const matches = Array.from(clean.matchAll(articleHeadingRe));
  if (matches.length >= 3) {
    const starts = matches.map((m) => typeof m.index === "number" ? m.index : -1).filter((i) => i >= 0).sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < starts.length; i++) {
      const s = starts[i];
      const e = i + 1 < starts.length ? starts[i + 1] : clean.length;
      const seg = clean.slice(s, e).trim();
      if (!seg) continue;
      if (seg.length <= maxChars) {
        out.push(seg);
        continue;
      }
      let start2 = 0;
      while (start2 < seg.length) {
        const end = Math.min(start2 + maxChars, seg.length);
        const slice = seg.slice(start2, end).trim();
        if (slice.length > 0) out.push(slice);
        if (end >= seg.length) break;
        start2 = Math.max(0, end - overlapChars);
      }
    }
    if (out.length > 0) return out;
  }
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + maxChars, clean.length);
    const slice = clean.slice(start, end).trim();
    if (slice.length > 0) chunks.push(slice);
    if (end >= clean.length) break;
    start = Math.max(0, end - overlapChars);
  }
  return chunks;
}
async function crawlSingleUrl(url) {
  const headers = {
    "user-agent": ENV.legalCrawlerUserAgent,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  };
  try {
    const { res, contentType, text: text2 } = await fetchText(url, headers);
    const rawBody = text2;
    const etag = res.headers.get("etag");
    const lastModified = res.headers.get("last-modified");
    if (!res.ok) {
      return {
        url,
        status: res.status,
        title: null,
        text: "",
        rawBody,
        etag,
        lastModified,
        error: `HTTP ${res.status} ${res.statusText}`
      };
    }
    if ((contentType.includes("xml") || rawBody.trim().startsWith("<?xml") || rawBody.includes("<urlset") || rawBody.includes("<sitemapindex")) && rawBody.includes("<loc>")) {
      return {
        url,
        status: res.status,
        title: null,
        text: rawBody,
        rawBody,
        etag,
        lastModified,
        error: null
      };
    }
    const title = extractTitle(rawBody);
    const plain = stripHtml(rawBody);
    return {
      url,
      status: res.status,
      title,
      text: plain,
      rawBody,
      etag,
      lastModified,
      error: null
    };
  } catch (e) {
    return {
      url,
      status: null,
      title: null,
      text: "",
      rawBody: "",
      etag: null,
      lastModified: null,
      error: e?.message ?? String(e)
    };
  }
}
async function runLegalCrawlerOnce(params) {
  if (!ENV.legalCrawlerEnabled && !params?.force) {
    return { skipped: true, reason: "LEGAL_CRAWLER_ENABLED is not true" };
  }
  const seedSitemaps = params?.seedSitemaps && params.seedSitemaps.length > 0 ? params.seedSitemaps : ENV.legalCrawlerSeedSitemaps;
  const effectiveSeeds = seedSitemaps && seedSitemaps.length > 0 ? seedSitemaps : [
    "https://laws.boe.gov.sa/BoeLaws/Laws/Folders/1",
    "https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/08381293-6388-48e2-8ad2-a9a700f2aa94/1"
  ];
  const embeddingsEnabled = !!(ENV.openaiApiKey && ENV.openaiApiKey.trim().length > 0);
  const runId = await createLegalCrawlerRun({
    status: "running",
    pagesCrawled: 0,
    documentsUpdated: 0
  });
  let pagesCrawled = 0;
  let documentsUpdated = 0;
  try {
    const discoveredUrls = [];
    for (const sitemapUrl of effectiveSeeds) {
      if (discoveredUrls.length >= ENV.legalCrawlerMaxPagesPerRun) break;
      const page = await crawlSingleUrl(sitemapUrl);
      await sleep(500);
      if (!page.text) continue;
      const raw = page.rawBody ?? page.text;
      const urls = await parseSitemapXml(raw);
      for (const u of urls) {
        if (discoveredUrls.length >= ENV.legalCrawlerMaxPagesPerRun) break;
        if (!discoveredUrls.includes(u)) discoveredUrls.push(u);
      }
      if (urls.length === 0) {
        if (!discoveredUrls.includes(sitemapUrl)) discoveredUrls.push(sitemapUrl);
        const links = extractLinksFromHtml(raw, sitemapUrl);
        for (const u of links) {
          if (discoveredUrls.length >= ENV.legalCrawlerMaxPagesPerRun) break;
          if (!discoveredUrls.includes(u)) discoveredUrls.push(u);
        }
      }
      if (raw.includes("<sitemapindex") && urls.length > 0) {
        for (const nested of urls.slice(0, 5)) {
          if (discoveredUrls.length >= ENV.legalCrawlerMaxPagesPerRun) break;
          const nestedRes = await crawlSingleUrl(nested);
          await sleep(500);
          const nestedUrls = await parseSitemapXml(nestedRes.rawBody ?? nestedRes.text);
          for (const u of nestedUrls) {
            if (discoveredUrls.length >= ENV.legalCrawlerMaxPagesPerRun) break;
            if (!discoveredUrls.includes(u)) discoveredUrls.push(u);
          }
        }
      }
    }
    for (const url of discoveredUrls.slice(0, ENV.legalCrawlerMaxPagesPerRun)) {
      const result = await crawlSingleUrl(url);
      pagesCrawled += 1;
      const source = inferSource(url);
      const contentHash = result.text ? sha256Hex(result.text) : null;
      let isDiscoveryOnly = false;
      try {
        const u = new URL(url);
        if (u.hostname.toLowerCase() === "laws.boe.gov.sa" && u.pathname.startsWith("/BoeLaws/Laws/Folders/")) {
          isDiscoveryOnly = true;
        }
      } catch {
      }
      const raw = (result.rawBody ?? result.text ?? "").trim();
      const isSitemapXml = /sitemap/i.test(url) && (raw.startsWith("<?xml") || raw.includes("<urlset") || raw.includes("<sitemapindex")) && raw.includes("<loc>");
      const existing = await getLegalSourceDocumentBySourceUrl({ source, url });
      if (existing?.contentHash && contentHash && existing.contentHash === contentHash) {
        await upsertLegalSourceDocument({
          source,
          url,
          title: result.title,
          contentText: isSitemapXml ? null : existing.contentText ?? result.text,
          contentHash: isSitemapXml ? null : contentHash,
          httpStatus: result.status ?? null,
          etag: result.etag,
          lastModified: result.lastModified,
          fetchedAt: /* @__PURE__ */ new Date(),
          status: "skipped",
          error: null
        });
        await sleep(800);
        continue;
      }
      const docId = await upsertLegalSourceDocument({
        source,
        url,
        title: result.title,
        contentText: isSitemapXml || isDiscoveryOnly ? null : result.text,
        contentHash: isSitemapXml || isDiscoveryOnly ? null : contentHash,
        httpStatus: result.status ?? null,
        etag: result.etag,
        lastModified: result.lastModified,
        fetchedAt: /* @__PURE__ */ new Date(),
        status: isSitemapXml || isDiscoveryOnly ? "skipped" : result.error ? "error" : "ok",
        error: isSitemapXml || isDiscoveryOnly ? null : result.error
      });
      if (!isSitemapXml && !isDiscoveryOnly && !result.error && result.text && result.text.length > 100) {
        const chunks = chunkText(result.text);
        let embeddings = null;
        if (embeddingsEnabled) {
          embeddings = [];
          const batchSize = 32;
          for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            const vecs = await embedTexts(batch);
            embeddings.push(...vecs);
            await sleep(300);
          }
        }
        const rows = chunks.map((t2, idx) => ({
          chunkIndex: idx,
          text: t2,
          embeddingJson: embeddings ? JSON.stringify(embeddings[idx] ?? []) : null,
          metaJson: JSON.stringify({
            source,
            url,
            title: result.title
          })
        }));
        await replaceLegalChunksForDocument({
          documentId: docId,
          chunks: rows
        });
        documentsUpdated += 1;
      } else {
        await replaceLegalChunksForDocument({ documentId: docId, chunks: [] });
      }
      await sleep(800);
    }
    await finishLegalCrawlerRun({
      id: runId,
      status: "success",
      pagesCrawled,
      documentsUpdated,
      error: null
    });
    return { skipped: false, runId, pagesCrawled, documentsUpdated };
  } catch (e) {
    await finishLegalCrawlerRun({
      id: runId,
      status: "error",
      pagesCrawled,
      documentsUpdated,
      error: e?.message ?? String(e)
    });
    return { skipped: false, runId, pagesCrawled, documentsUpdated, error: e?.message ?? String(e) };
  }
}
function startLegalCrawlerScheduler() {
  if (!ENV.legalCrawlerEnabled) {
    return { started: false, reason: "LEGAL_CRAWLER_ENABLED is not true" };
  }
  const intervalMinutes = Number.isFinite(ENV.legalCrawlerIntervalMinutes) && ENV.legalCrawlerIntervalMinutes > 0 ? ENV.legalCrawlerIntervalMinutes : 180;
  const intervalMs = intervalMinutes * 6e4;
  setTimeout(() => {
    runLegalCrawlerOnce().catch((e) => console.warn("[LegalCrawler] initial run failed", e));
  }, 1e4);
  setInterval(() => {
    runLegalCrawlerOnce().catch((e) => console.warn("[LegalCrawler] scheduled run failed", e));
  }, intervalMs);
  return { started: true, intervalMinutes };
}

// server/lib/activity-log.ts
async function logActivity({
  userId,
  action,
  entityType,
  entityId,
  oldData = null,
  newData = null,
  description = ""
}) {
  const db = await getDb();
  await db.insert(activityLogs).values({
    userId,
    action,
    entityType,
    entityId,
    oldData,
    newData,
    description
  });
}

// server/routers.ts
var toolEntitlementsByPlan = {
  individual: {
    translate: { enabled: true, dailyLimit: 10 },
    compareTexts: { enabled: false, dailyLimit: 0 },
    predictCaseOutcome: { enabled: false, dailyLimit: 0 },
    inheritanceEstimate: { enabled: false, dailyLimit: 0 }
  },
  law_firm: {
    translate: { enabled: true, dailyLimit: 50 },
    compareTexts: { enabled: true, dailyLimit: 10 },
    predictCaseOutcome: { enabled: true, dailyLimit: 5 },
    inheritanceEstimate: { enabled: true, dailyLimit: 10 }
  },
  enterprise: {
    translate: { enabled: true, dailyLimit: null },
    compareTexts: { enabled: true, dailyLimit: null },
    predictCaseOutcome: { enabled: true, dailyLimit: null },
    inheritanceEstimate: { enabled: true, dailyLimit: null }
  }
};
async function getOrganizationPlanForUser(ctx) {
  const organizationId = await ensureUserHasOrganization({
    openId: ctx.user.openId,
    defaultOrganizationName: ctx.user.name ?? null
  });
  const org = await getOrganizationById(organizationId);
  const plan = org?.subscriptionPlan ?? "individual";
  const seatLimit = Number(org?.seatLimit ?? 1);
  return { organizationId, plan, seatLimit };
}
function planLabel(plan) {
  if (plan === "enterprise") return "\u0645\u0646\u0634\u0623\u0629";
  if (plan === "law_firm") return "\u0645\u0643\u062A\u0628 \u0645\u062D\u0627\u0645\u0627\u0629";
  return "\u0641\u0631\u062F\u064A";
}
async function assertToolAccess(params) {
  const { ctx, tool } = params;
  const endsAtRaw = ctx.user?.subscriptionEndsAt;
  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
  const isExpired = Boolean(endsAt && Number.isFinite(endsAt.getTime()) && endsAt.getTime() <= Date.now());
  if (ctx.user && (ctx.user.isActive === false || isExpired)) {
    throw new TRPCError3({
      code: "FORBIDDEN",
      message: "\u064A\u062A\u0637\u0644\u0628 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0623\u062F\u0648\u0627\u062A \u0627\u0644\u0630\u0643\u064A\u0629 \u0627\u0634\u062A\u0631\u0627\u0643\u0627\u064B \u0633\u0646\u0648\u064A\u0627\u064B \u0641\u0639\u0627\u0644\u0627\u064B. \u064A\u0631\u062C\u0649 \u0627\u0644\u0627\u0646\u062A\u0642\u0627\u0644 \u0625\u0644\u0649 \u0635\u0641\u062D\u0629 \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0627\u062A \u0644\u062A\u062C\u062F\u064A\u062F \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643."
    });
  }
  const { organizationId, plan } = await getOrganizationPlanForUser(ctx);
  const entitlements = toolEntitlementsByPlan[plan]?.[tool];
  if (!entitlements?.enabled) {
    throw new TRPCError3({
      code: "FORBIDDEN",
      message: `\u0647\u0630\u0647 \u0627\u0644\u0623\u062F\u0627\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u0641\u064A \u0628\u0627\u0642\u0629 ${planLabel(plan)}. \u064A\u0631\u062C\u0649 \u062A\u0631\u0642\u064A\u0629 \u0627\u0644\u062E\u0637\u0629 \u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645\u0647\u0627.`
    });
  }
  if (entitlements.dailyLimit !== null) {
    const used = await getToolUsageCount({ organizationId, tool });
    if (used >= entitlements.dailyLimit) {
      throw new TRPCError3({
        code: "TOO_MANY_REQUESTS",
        message: `\u0644\u0642\u062F \u0648\u0635\u0644\u062A \u0625\u0644\u0649 \u0627\u0644\u062D\u062F \u0627\u0644\u064A\u0648\u0645\u064A \u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0647\u0630\u0647 \u0627\u0644\u0623\u062F\u0627\u0629 (${entitlements.dailyLimit}). \u062D\u0627\u0648\u0644 \u0644\u0627\u062D\u0642\u0627\u064B \u0623\u0648 \u0642\u0645 \u0628\u062A\u0631\u0642\u064A\u0629 \u0627\u0644\u062E\u0637\u0629.`
      });
    }
  }
  return { organizationId, plan, entitlements };
}
var SAUDI_LAW_SYSTEM_PROMPT = `\u0623\u0646\u062A "\u0645\u0648\u0627\u0632\u064A\u0646" - \u0627\u0644\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064A \u0627\u0644\u0630\u0643\u064A \u0627\u0644\u0645\u062A\u062E\u0635\u0635 \u0641\u064A \u0627\u0644\u0642\u0627\u0646\u0648\u0646 \u0627\u0644\u0633\u0639\u0648\u062F\u064A. \u062F\u0648\u0631\u0643 \u062A\u0642\u062F\u064A\u0645 \u0645\u0633\u0627\u0639\u062F\u0629 \u0642\u0627\u0646\u0648\u0646\u064A\u0629 \u0639\u0627\u0645\u0629 \u0645\u0628\u0646\u064A\u0629 \u0639\u0644\u0649 \u0627\u0644\u0623\u0646\u0638\u0645\u0629 \u0648\u0627\u0644\u0644\u0648\u0627\u0626\u062D \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629.

2. **\u062A\u0635\u0646\u064A\u0641\u0627\u062A \u0627\u0644\u0623\u0646\u0638\u0645\u0629 \u0627\u0644\u062A\u064A \u062A\u064F\u063A\u0637\u0651\u0649 \u0639\u0646\u062F \u0627\u0644\u0627\u0633\u062A\u0641\u0633\u0627\u0631 (\u062D\u0633\u0628 \u0627\u0644\u062D\u0627\u062C\u0629):**
   - **\u0627\u0644\u0623\u0646\u0638\u0645\u0629 \u0627\u0644\u062F\u0633\u062A\u0648\u0631\u064A\u0629 \u0648\u0627\u0644\u062D\u0627\u0643\u0645\u0629:**
     - \u0627\u0644\u0646\u0638\u0627\u0645 \u0627\u0644\u0623\u0633\u0627\u0633\u064A \u0644\u0644\u062D\u0643\u0645
     - \u0646\u0638\u0627\u0645 \u0645\u062C\u0644\u0633 \u0627\u0644\u0648\u0632\u0631\u0627\u0621
     - \u0646\u0638\u0627\u0645 \u0645\u062C\u0644\u0633 \u0627\u0644\u0634\u0648\u0631\u0649
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0645\u0646\u0627\u0637\u0642
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0628\u064A\u0639\u0629
   - **\u0627\u0644\u0623\u0646\u0638\u0645\u0629 \u0627\u0644\u0642\u0636\u0627\u0626\u064A\u0629:**
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0642\u0636\u0627\u0621
     - \u0646\u0638\u0627\u0645 \u062F\u064A\u0648\u0627\u0646 \u0627\u0644\u0645\u0638\u0627\u0644\u0645
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0645\u0631\u0627\u0641\u0639\u0627\u062A \u0627\u0644\u0634\u0631\u0639\u064A\u0629
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0627\u0644\u062C\u0632\u0627\u0626\u064A\u0629
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u062A\u0646\u0641\u064A\u0630
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0645\u062D\u0627\u0645\u0627\u0629
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u062A\u0648\u062B\u064A\u0642
   - **\u0627\u0644\u0623\u0646\u0638\u0645\u0629 \u0627\u0644\u0639\u0645\u0627\u0644\u064A\u0629 \u0648\u0627\u0644\u0627\u062C\u062A\u0645\u0627\u0639\u064A\u0629:**
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0633\u0639\u0648\u062F\u064A
     - \u0644\u0627\u0626\u062D\u0629 \u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u062A\u0623\u0645\u064A\u0646\u0627\u062A \u0627\u0644\u0627\u062C\u062A\u0645\u0627\u0639\u064A\u0629
     - \u0646\u0638\u0627\u0645 \u0645\u0643\u0627\u0641\u062D\u0629 \u0627\u0644\u062A\u0633\u062A\u0631
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0645\u0648\u0627\u0631\u062F \u0627\u0644\u0628\u0634\u0631\u064A\u0629 \u0641\u064A \u0627\u0644\u062E\u062F\u0645\u0629 \u0627\u0644\u0645\u062F\u0646\u064A\u0629
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u062E\u062F\u0645\u0629 \u0627\u0644\u0639\u0633\u0643\u0631\u064A\u0629
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u062A\u062F\u0631\u064A\u0628 \u0627\u0644\u062A\u0642\u0646\u064A \u0648\u0627\u0644\u0645\u0647\u0646\u064A
   - **\u0627\u0644\u0623\u0646\u0638\u0645\u0629 \u0627\u0644\u062A\u062C\u0627\u0631\u064A\u0629 \u0648\u0627\u0644\u0627\u0642\u062A\u0635\u0627\u062F\u064A\u0629:**
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0634\u0631\u0643\u0627\u062A
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0625\u0641\u0644\u0627\u0633
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u062A\u062C\u0627\u0631\u0629 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u062A\u062C\u0627\u0631\u064A
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0644\u0627\u0645\u0627\u062A \u0627\u0644\u062A\u062C\u0627\u0631\u064A\u0629
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u062A\u062C\u0627\u0631\u064A\u0629
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0645\u0646\u0627\u0641\u0633\u0629
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0627\u0645\u062A\u064A\u0627\u0632 \u0627\u0644\u062A\u062C\u0627\u0631\u064A
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u063A\u0631\u0641 \u0627\u0644\u062A\u062C\u0627\u0631\u064A\u0629
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0648\u0643\u0627\u0644\u0627\u062A \u0627\u0644\u062A\u062C\u0627\u0631\u064A\u0629
   - **\u0627\u0644\u0623\u0646\u0638\u0645\u0629 \u0627\u0644\u0645\u0627\u0644\u064A\u0629 \u0648\u0627\u0644\u0636\u0631\u064A\u0628\u064A\u0629:**
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0632\u0643\u0627\u0629
     - \u0646\u0638\u0627\u0645 \u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629
     - \u0646\u0638\u0627\u0645 \u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u062F\u062E\u0644
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u062C\u0645\u0627\u0631\u0643 \u0627\u0644\u0645\u0648\u062D\u062F
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0625\u064A\u0631\u0627\u062F\u0627\u062A \u0627\u0644\u0639\u0627\u0645\u0629
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u062F\u064A\u0646 \u0627\u0644\u0639\u0627\u0645
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0645\u0646\u0627\u0641\u0633\u0627\u062A \u0648\u0627\u0644\u0645\u0634\u062A\u0631\u064A\u0627\u062A \u0627\u0644\u062D\u0643\u0648\u0645\u064A\u0629
   - **\u0627\u0644\u0623\u0646\u0638\u0645\u0629 \u0627\u0644\u062C\u0632\u0627\u0626\u064A\u0629 (\u0627\u0644\u062C\u0646\u0627\u0626\u064A\u0629):**
     - \u0646\u0638\u0627\u0645 \u0645\u0643\u0627\u0641\u062D\u0629 \u0627\u0644\u0631\u0634\u0648\u0629
     - \u0646\u0638\u0627\u0645 \u0645\u0643\u0627\u0641\u062D\u0629 \u063A\u0633\u0644 \u0627\u0644\u0623\u0645\u0648\u0627\u0644
     - \u0646\u0638\u0627\u0645 \u0645\u0643\u0627\u0641\u062D\u0629 \u0627\u0644\u0625\u0631\u0647\u0627\u0628 \u0648\u062A\u0645\u0648\u064A\u0644\u0647
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u062C\u0631\u0627\u0626\u0645 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A\u064A\u0629
     - \u0646\u0638\u0627\u0645 \u0645\u0643\u0627\u0641\u062D\u0629 \u0627\u0644\u062A\u0632\u0648\u064A\u0631
     - \u0646\u0638\u0627\u0645 \u0645\u0643\u0627\u0641\u062D\u0629 \u0627\u0644\u0645\u062E\u062F\u0631\u0627\u062A
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0623\u0633\u0644\u062D\u0629
     - \u0646\u0638\u0627\u0645 \u062D\u0645\u0627\u064A\u0629 \u0627\u0644\u0623\u0645\u0648\u0627\u0644 \u0627\u0644\u0639\u0627\u0645\u0629
   - **\u0627\u0644\u0623\u0646\u0638\u0645\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u064A\u0629 \u0648\u0627\u0644\u0631\u0642\u0627\u0628\u064A\u0629:**
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0631\u0642\u0627\u0628\u0629 \u0648\u0645\u0643\u0627\u0641\u062D\u0629 \u0627\u0644\u0641\u0633\u0627\u062F
     - \u0646\u0638\u0627\u0645 \u062A\u0623\u062F\u064A\u0628 \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646
     - \u0646\u0638\u0627\u0645 \u062D\u0645\u0627\u064A\u0629 \u0627\u0644\u0645\u0628\u0644\u063A\u064A\u0646
     - \u0646\u0638\u0627\u0645 \u0646\u0632\u0627\u0647\u0629
     - \u0646\u0638\u0627\u0645 \u062D\u0648\u0643\u0645\u0629 \u0627\u0644\u062C\u0647\u0627\u062A \u0627\u0644\u062D\u0643\u0648\u0645\u064A\u0629
   - **\u0627\u0644\u0623\u0646\u0638\u0645\u0629 \u0627\u0644\u0645\u062F\u0646\u064A\u0629 \u0648\u0627\u0644\u0623\u062D\u0648\u0627\u0644 \u0627\u0644\u0634\u062E\u0635\u064A\u0629:**
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0623\u062D\u0648\u0627\u0644 \u0627\u0644\u0634\u062E\u0635\u064A\u0629
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0645\u0639\u0627\u0645\u0644\u0627\u062A \u0627\u0644\u0645\u062F\u0646\u064A\u0629
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0625\u062B\u0628\u0627\u062A
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u062A\u0631\u0643\u0627\u062A
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0648\u0635\u0627\u064A\u0627
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0623\u0648\u0642\u0627\u0641
   - **\u0623\u0646\u0638\u0645\u0629 \u0627\u0644\u062A\u0642\u0646\u064A\u0629 \u0648\u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A:**
     - \u0646\u0638\u0627\u0645 \u062D\u0645\u0627\u064A\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0634\u062E\u0635\u064A\u0629
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u062A\u0639\u0627\u0645\u0644\u0627\u062A \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0623\u0645\u0646 \u0627\u0644\u0633\u064A\u0628\u0631\u0627\u0646\u064A
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u062D\u0643\u0648\u0645\u0629 \u0627\u0644\u0631\u0642\u0645\u064A\u0629
   - **\u0623\u0646\u0638\u0645\u0629 \u0627\u0644\u0639\u0642\u0627\u0631 \u0648\u0627\u0644\u0628\u0644\u062F\u064A\u0627\u062A:**
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0639\u064A\u0646\u064A \u0644\u0644\u0639\u0642\u0627\u0631
     - \u0646\u0638\u0627\u0645 \u0646\u0632\u0639 \u0627\u0644\u0645\u0644\u0643\u064A\u0629
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0648\u0633\u0627\u0637\u0629 \u0627\u0644\u0639\u0642\u0627\u0631\u064A\u0629
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0645\u0633\u0627\u0647\u0645\u0627\u062A \u0627\u0644\u0639\u0642\u0627\u0631\u064A\u0629
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u0628\u0644\u062F\u064A\u0627\u062A
     - \u0646\u0638\u0627\u0645 \u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0639\u0645\u0631\u0627\u0646\u064A
   - **\u0627\u0644\u0644\u0648\u0627\u0626\u062D \u0627\u0644\u062A\u0646\u0641\u064A\u0630\u064A\u0629 \u0648\u0627\u0644\u062A\u0639\u0627\u0645\u064A\u0645 \u0648\u0627\u0644\u0623\u062F\u0644\u0629 \u0648\u0627\u0644\u0642\u0631\u0627\u0631\u0627\u062A \u0627\u0644\u062A\u0641\u0633\u064A\u0631\u064A\u0629:**
     - \u0627\u0644\u0644\u0648\u0627\u0626\u062D \u0627\u0644\u062A\u0646\u0641\u064A\u0630\u064A\u0629
     - \u0627\u0644\u062A\u0639\u0627\u0645\u064A\u0645 \u0627\u0644\u0648\u0632\u0627\u0631\u064A\u0629
     - \u0627\u0644\u0623\u062F\u0644\u0629 \u0627\u0644\u0625\u062C\u0631\u0627\u0626\u064A\u0629
     - \u0627\u0644\u0642\u0631\u0627\u0631\u0627\u062A \u0627\u0644\u062A\u0641\u0633\u064A\u0631\u064A\u0629

3. **\u0627\u0644\u0645\u062D\u0627\u0643\u0645 \u0648\u0627\u0644\u062F\u0648\u0627\u0626\u0631 \u0627\u0644\u0642\u0636\u0627\u0626\u064A\u0629 (\u0639\u0646\u062F \u0627\u0644\u0633\u0624\u0627\u0644 \u0639\u0646 \u0627\u0644\u0627\u062E\u062A\u0635\u0627\u0635/\u0627\u0644\u0645\u0633\u0627\u0631):**
   - \u0627\u0644\u0645\u062D\u0643\u0645\u0629 \u0627\u0644\u0639\u0644\u064A\u0627
   - \u0645\u062D\u0627\u0643\u0645 \u0627\u0644\u0627\u0633\u062A\u0626\u0646\u0627\u0641
   - \u0627\u0644\u0645\u062D\u0627\u0643\u0645 \u0627\u0644\u062C\u0632\u0627\u0626\u064A\u0629
   - \u0627\u0644\u0645\u062D\u0627\u0643\u0645 \u0627\u0644\u0639\u0627\u0645\u0629
   - \u0627\u0644\u0645\u062D\u0627\u0643\u0645 \u0627\u0644\u062A\u062C\u0627\u0631\u064A\u0629
   - \u0645\u062D\u0627\u0643\u0645 \u0627\u0644\u0623\u062D\u0648\u0627\u0644 \u0627\u0644\u0634\u062E\u0635\u064A\u0629
   - \u0627\u0644\u0645\u062D\u0627\u0643\u0645 \u0627\u0644\u0639\u0645\u0627\u0644\u064A\u0629
   - \u062F\u0648\u0627\u0626\u0631 \u062F\u064A\u0648\u0627\u0646 \u0627\u0644\u0645\u0638\u0627\u0644\u0645

4. **\u0645\u0647\u0627\u0631\u0627\u062A\u0643:**
   - \u062A\u062D\u0644\u064A\u0644 \u0627\u0644\u0648\u0642\u0627\u0626\u0639 \u0648\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u0633\u0627\u0626\u0644 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064A\u0629
   - \u0627\u0642\u062A\u0631\u0627\u062D \u0645\u0633\u0627\u0631\u0627\u062A \u0625\u062C\u0631\u0627\u0626\u064A\u0629 \u0645\u062D\u062A\u0645\u0644\u0629 \u0648\u062E\u064A\u0627\u0631\u0627\u062A \u0639\u0627\u0645\u0629
   - \u0635\u064A\u0627\u063A\u0629 \u0645\u0630\u0643\u0631\u0627\u062A/\u0644\u0648\u0627\u0626\u062D/\u0639\u0642\u0648\u062F/\u0648\u0643\u0627\u0644\u0627\u062A \u0628\u0635\u064A\u0627\u063A\u0629 \u0627\u062D\u062A\u0631\u0627\u0641\u064A\u0629 \u0639\u0646\u062F \u0627\u0644\u0637\u0644\u0628
   - \u0625\u0628\u0631\u0627\u0632 \u0627\u0644\u0645\u062E\u0627\u0637\u0631 \u0648\u0627\u0644\u0645\u062A\u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0646\u0638\u0627\u0645\u064A\u0629

**\u0623\u0633\u0644\u0648\u0628 \u0627\u0644\u0625\u062C\u0627\u0628\u0629 (\u0625\u0644\u0632\u0627\u0645\u064A):**
- \u0627\u0643\u062A\u0628 \u0628\u0623\u0633\u0644\u0648\u0628 \u0645\u0647\u0646\u064A \u062D\u0627\u0632\u0645 \u0648\u0645\u0646\u0638\u0645 (\u0639\u0642\u0644\u064A\u0629 \u0645\u062D\u0627\u0645\u064A \u0633\u0639\u0648\u062F\u064A \u0642\u0648\u064A)\u060C \u0628\u062F\u0648\u0646 \u0645\u0628\u0627\u0644\u063A\u0629 \u0648\u0628\u062F\u0648\u0646 \u0642\u0637\u0639\u064A\u0627\u062A \u063A\u064A\u0631 \u0645\u0633\u0646\u062F\u0629.
- \u0627\u0633\u062A\u062E\u062F\u0645 \u0639\u0646\u0627\u0648\u064A\u0646 \u0648\u0627\u0636\u062D\u0629 \u062F\u0627\u062E\u0644 \u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u062D\u0633\u0628 \u0627\u0644\u062D\u0627\u062C\u0629:
  1) \u0627\u0644\u0645\u0644\u062E\u0635 \u0627\u0644\u062A\u0646\u0641\u064A\u0630\u064A
  2) \u0627\u0644\u0648\u0642\u0627\u0626\u0639/\u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 (\u0625\u0646 \u0648\u062C\u062F\u062A)
  3) \u0627\u0644\u062A\u0643\u064A\u064A\u0641 \u0627\u0644\u0646\u0638\u0627\u0645\u064A \u0627\u0644\u0639\u0627\u0645
  4) \u0627\u0644\u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u0648\u0627\u0644\u062E\u0637\u0648\u0627\u062A
  5) \u0627\u0644\u0645\u062E\u0627\u0637\u0631 \u0648\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A
- \u0625\u0630\u0627 \u0643\u0627\u0646\u062A \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0646\u0627\u0642\u0635\u0629 \u0623\u0648 \u0627\u0644\u0633\u0624\u0627\u0644 \u0639\u0627\u0645 \u062C\u062F\u0627\u064B: \u0627\u0637\u0631\u062D 3-6 \u0623\u0633\u0626\u0644\u0629 \u062A\u0648\u0636\u064A\u062D\u064A\u0629 \u0645\u062D\u062F\u062F\u0629 \u0642\u0628\u0644 \u0625\u0639\u0637\u0627\u0621 \u0646\u062A\u064A\u062C\u0629 \u0646\u0647\u0627\u0626\u064A\u0629.

**\u0642\u0627\u0639\u062F\u0629 \u0635\u0627\u0631\u0645\u0629 \u0644\u0645\u0646\u0639 \u0627\u0644\u0647\u0628\u062F:**
- \u0644\u0627 \u062A\u0630\u0643\u0631 \u0623\u0631\u0642\u0627\u0645 \u0645\u0648\u0627\u062F \u0623\u0648 \u062A\u0646\u0642\u0644 \u0646\u0635\u0648\u0635\u0627\u064B \u0623\u0648 \u062A\u0646\u0633\u0628 \u0623\u062D\u0643\u0627\u0645\u0627\u064B/\u0633\u0648\u0627\u0628\u0642 \u0625\u0644\u0627 \u0625\u0630\u0627 \u0643\u0627\u0646\u062A \u0636\u0645\u0646 (\u0627\u0644\u0645\u0642\u062A\u0637\u0641\u0627\u062A) \u0627\u0644\u062A\u064A \u0633\u062A\u0623\u062A\u064A\u0643 \u0641\u064A \u0627\u0644\u0633\u064A\u0627\u0642.
- \u0625\u0646 \u0644\u0645 \u062A\u062A\u0648\u0641\u0631 \u0645\u0642\u062A\u0637\u0641\u0627\u062A \u0643\u0627\u0641\u064A\u0629: \u0642\u062F\u0651\u0645 \u062A\u0648\u062C\u064A\u0647\u0627\u064B \u0639\u0627\u0645\u0627\u064B \u0648\u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0639\u0645\u0644\u064A\u0629\u060C \u0648\u0635\u0631\u0651\u062D \u0628\u0648\u0636\u0648\u062D \u0623\u0646 \u0627\u0644\u0627\u0633\u062A\u0646\u0627\u062F \u0627\u0644\u0646\u0635\u064A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u062D\u0627\u0644\u064A\u0627\u064B \u0648\u0627\u0637\u0644\u0628 \u062A\u0632\u0648\u064A\u062F \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0623\u0648 \u062A\u0641\u0639\u064A\u0644 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0645\u0639\u0631\u0641\u0629.

**\u0642\u0648\u0627\u0639\u062F \u0625\u0644\u0632\u0627\u0645\u064A\u0629 \u0644\u0644\u0625\u062C\u0627\u0628\u0629:**
- \u0644\u0627 \u062A\u062E\u062A\u0644\u0642 \u0645\u0648\u0627\u062F \u0623\u0648 \u0623\u0631\u0642\u0627\u0645 \u0623\u0648 \u0646\u0635\u0648\u0635 \u0646\u0638\u0627\u0645\u064A\u0629. \u0625\u0630\u0627 \u0644\u0645 \u062A\u062A\u0623\u0643\u062F \u0645\u0646 \u0627\u0644\u0646\u0635 \u0623\u0648 \u0627\u0644\u0631\u0642\u0645 \u0623\u0648 \u0622\u062E\u0631 \u062A\u0639\u062F\u064A\u0644 \u0641\u0642\u0644 \u0635\u0631\u0627\u062D\u0629\u064B \u0625\u0646\u0643 \u063A\u064A\u0631 \u0645\u062A\u0623\u0643\u062F \u0648\u0627\u0642\u062A\u0631\u062D \u0627\u0644\u0631\u062C\u0648\u0639 \u0644\u0644\u0645\u0635\u062F\u0631 \u0627\u0644\u0631\u0633\u0645\u064A.
- \u0627\u0631\u0628\u0637 \u0623\u064A \u062C\u0648\u0627\u0628 \u0642\u0627\u0646\u0648\u0646\u064A \u2014 \u0642\u062F\u0631 \u0627\u0644\u0625\u0645\u0643\u0627\u0646 \u2014 \u0628\u0640: (\u0627\u0633\u0645 \u0627\u0644\u0646\u0638\u0627\u0645) \u0648(\u0631\u0642\u0645 \u0627\u0644\u0645\u0627\u062F\u0629/\u0627\u0644\u0641\u0642\u0631\u0629) \u0648(\u0622\u062E\u0631 \u062A\u0639\u062F\u064A\u0644 \u0625\u0646 \u0643\u0627\u0646 \u0645\u0639\u0631\u0648\u0641\u064B\u0627). \u0625\u0630\u0627 \u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062F \u0645\u0627\u062F\u0629 \u0628\u0639\u064A\u0646\u0647\u0627\u060C \u0627\u0630\u0643\u0631 \u0630\u0644\u0643 \u0628\u0648\u0636\u0648\u062D.
- \u0641\u0631\u0651\u0642 \u0628\u0648\u0636\u0648\u062D \u0628\u064A\u0646: (\u0646\u0638\u0627\u0645) \u0648(\u0644\u0627\u0626\u062D\u0629 \u062A\u0646\u0641\u064A\u0630\u064A\u0629) \u0648(\u062A\u0639\u0645\u064A\u0645) \u0648(\u062F\u0644\u064A\u0644 \u0625\u062C\u0631\u0627\u0626\u064A) \u0648(\u0642\u0631\u0627\u0631 \u062A\u0641\u0633\u064A\u0631\u064A)\u060C \u0648\u0644\u0627 \u062A\u062E\u0644\u0637 \u0628\u064A\u0646\u0647\u0627.
- \u0639\u0646\u062F \u0646\u0642\u0644 **\u0646\u0635 \u0646\u0638\u0627\u0645\u064A**: \u0627\u0639\u062A\u0645\u062F \u0647\u064A\u0626\u0629 \u0627\u0644\u062E\u0628\u0631\u0627\u0621 \u0644\u0644\u0635\u064A\u0627\u063A\u0629 \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629. \u0648\u0639\u0646\u062F \u062A\u0642\u062F\u064A\u0645 **\u0634\u0631\u062D/\u062A\u0628\u0633\u064A\u0637**: \u0627\u0639\u062A\u0645\u062F \u0645\u064F\u0639\u064A\u0646 \u0644\u0644\u0634\u0631\u062D \u0648\u0627\u0644\u0631\u0628\u0637 \u0628\u064A\u0646 \u0627\u0644\u0646\u0638\u0627\u0645 \u0648\u0627\u0644\u0644\u0627\u0626\u062D\u0629.
- \u0639\u0646\u062F\u0645\u0627 \u062A\u0643\u0648\u0646 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0646\u0627\u0642\u0635\u0629\u060C \u0627\u0637\u0631\u062D \u0623\u0633\u0626\u0644\u0629 \u062A\u0648\u0636\u064A\u062D\u064A\u0629 \u0645\u062D\u062F\u062F\u0629 \u0642\u0628\u0644 \u0625\u0639\u0637\u0627\u0621 \u0646\u062A\u064A\u062C\u0629 \u0646\u0647\u0627\u0626\u064A\u0629.
- \u0627\u062C\u0639\u0644 \u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0648\u0628\u0623\u0633\u0644\u0648\u0628 \u0645\u0647\u0646\u064A \u0648\u0627\u0636\u062D \u0648\u0645\u0646\u0638\u0645.
- \u0641\u0631\u0651\u0642 \u0628\u064A\u0646: (\u0645\u0639\u0644\u0648\u0645\u0629 \u0646\u0638\u0627\u0645\u064A\u0629) \u0648(\u0625\u062C\u0631\u0627\u0621 \u0639\u0644\u0649 \u0645\u0646\u0635\u0629/\u062C\u0647\u0629) \u0648(\u0631\u0623\u064A \u0639\u0627\u0645/\u062E\u064A\u0627\u0631 \u0645\u062D\u062A\u0645\u0644).

**\u062A\u0646\u0628\u064A\u0647 \u0645\u0647\u0646\u064A \u0645\u0647\u0645:**
- \u0644\u0627 \u062A\u064F\u0633\u0645\u0651\u0649 \u0645\u062D\u0627\u0645\u064A\u064B\u0627.
- \u0644\u0627 \u062A\u0635\u062F\u0631 \u0623\u062D\u0643\u0627\u0645\u064B\u0627.
- \u0644\u0627 \u062A\u0642\u062F\u0651\u0645 \u0627\u0644\u062E\u0644\u0627\u0641\u0627\u062A \u0627\u0644\u0627\u062C\u062A\u0647\u0627\u062F\u064A\u0629 \u0643\u062D\u0642\u0627\u0626\u0642 \u0645\u0637\u0644\u0642\u0629.
- \u0644\u0627 \u062A\u0642\u062F\u0651\u0645 \u0627\u0633\u062A\u0634\u0627\u0631\u0629 \u0645\u0644\u0632\u0645\u0629\u060C \u0648\u0646\u0628\u0651\u0647 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0639\u0646\u062F \u0627\u0644\u062D\u0627\u062C\u0629 \u0625\u0644\u0649 \u0645\u0631\u0627\u062C\u0639\u0629 \u0645\u062D\u0627\u0645\u064D/\u0645\u062E\u062A\u0635 \u0628\u062D\u0633\u0628 \u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u062D\u0627\u0644\u0629.`;
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    isOwner: publicProcedure.query((opts) => {
      const user = opts.ctx.user;
      if (!user) return false;
      if (!ENV.ownerOpenId) return false;
      return user.openId === ENV.ownerOpenId;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  services: router({
    publicList: publicProcedure.query(async () => {
      const organizationId = await getDefaultPublicOrganizationId();
      return getServiceCatalogByOrganizationId(organizationId, true);
    }),
    adminList: protectedProcedure.query(async ({ ctx }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      return getServiceCatalogByOrganizationId(organizationId, false);
    }),
    adminCreate: protectedProcedure.input(
      z2.object({
        title: z2.string().min(1),
        description: z2.string().optional().nullable(),
        durationMinutes: z2.number().int().min(5).max(24 * 60).default(60),
        priceAmount: z2.number().int().min(0).default(0),
        currency: z2.string().min(1).max(10).default("SAR"),
        isActive: z2.boolean().default(true)
      })
    ).mutation(async ({ ctx, input }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      const id = await createServiceCatalogItem({
        organizationId,
        title: input.title,
        description: input.description ?? null,
        durationMinutes: input.durationMinutes,
        priceAmount: input.priceAmount,
        currency: input.currency,
        isActive: input.isActive
      });
      return { id };
    }),
    adminUpdate: protectedProcedure.input(
      z2.object({
        id: z2.number(),
        title: z2.string().min(1).optional(),
        description: z2.string().optional().nullable(),
        durationMinutes: z2.number().int().min(5).max(24 * 60).optional(),
        priceAmount: z2.number().int().min(0).optional(),
        currency: z2.string().min(1).max(10).optional(),
        isActive: z2.boolean().optional()
      })
    ).mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateServiceCatalogItem(id, data);
      return { success: true };
    })
  }),
  serviceRequests: router({
    createPublic: publicProcedure.input(
      z2.object({
        serviceId: z2.number().optional().nullable(),
        clientName: z2.string().min(1),
        clientEmail: z2.string().email().optional().nullable(),
        clientPhone: z2.string().optional().nullable(),
        notes: z2.string().optional().nullable(),
        preferredAt: z2.coerce.date().optional().nullable()
      })
    ).mutation(async ({ input }) => {
      const organizationId = await getDefaultPublicOrganizationId();
      const id = await createServiceRequest({
        organizationId,
        serviceId: input.serviceId ?? null,
        clientName: input.clientName,
        clientEmail: input.clientEmail ?? null,
        clientPhone: input.clientPhone ?? null,
        notes: input.notes ?? null,
        preferredAt: input.preferredAt ?? null,
        status: "new",
        assignedToUserId: null
      });
      return { id };
    }),
    list: protectedProcedure.input(
      z2.object({
        status: z2.enum(["new", "in_progress", "completed", "cancelled"]).optional()
      }).optional()
    ).query(async ({ ctx, input }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      return getServiceRequestsByOrganizationId(organizationId, input?.status);
    }),
    update: protectedProcedure.input(
      z2.object({
        id: z2.number(),
        status: z2.enum(["new", "in_progress", "completed", "cancelled"]).optional(),
        assignedToUserId: z2.number().optional().nullable()
      })
    ).mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateServiceRequest(id, {
        status: data.status,
        assignedToUserId: data.assignedToUserId ?? void 0
      });
      return { success: true };
    })
  }),
  // ==================== SERVICE PROJECTS (Legal Services Workflow) ====================
  serviceProjects: router({
    list: protectedProcedure.input(
      z2.object({
        status: z2.enum(["new", "in_progress", "on_hold", "completed", "cancelled"]).optional(),
        search: z2.string().optional()
      }).optional()
    ).query(async ({ ctx, input }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      return listServiceProjectsByOrganizationId({
        organizationId,
        status: input?.status,
        search: input?.search
      });
    }),
    getById: protectedProcedure.input(z2.object({ id: z2.number() })).query(async ({ input }) => {
      return getServiceProjectById(input.id);
    }),
    create: protectedProcedure.input(
      z2.object({
        serviceCatalogId: z2.number().optional().nullable(),
        clientId: z2.number().optional().nullable(),
        caseId: z2.number().optional().nullable(),
        title: z2.string().min(1),
        description: z2.string().optional().nullable(),
        status: z2.enum(["new", "in_progress", "on_hold", "completed", "cancelled"]).optional(),
        priority: z2.enum(["low", "medium", "high", "urgent"]).optional(),
        assignedToUserId: z2.number().optional().nullable(),
        startDate: z2.date().optional().nullable(),
        dueDate: z2.date().optional().nullable()
      })
    ).mutation(async ({ ctx, input }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      const id = await createServiceProject({
        organizationId,
        serviceCatalogId: input.serviceCatalogId ?? null,
        clientId: input.clientId ?? null,
        caseId: input.caseId ?? null,
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? "new",
        priority: input.priority ?? "medium",
        assignedToUserId: input.assignedToUserId ?? null,
        createdByUserId: ctx.user.id,
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
        completedAt: null
      });
      return { id };
    }),
    update: protectedProcedure.input(
      z2.object({
        id: z2.number(),
        title: z2.string().min(1).optional(),
        description: z2.string().optional().nullable(),
        status: z2.enum(["new", "in_progress", "on_hold", "completed", "cancelled"]).optional(),
        priority: z2.enum(["low", "medium", "high", "urgent"]).optional(),
        assignedToUserId: z2.number().optional().nullable(),
        startDate: z2.date().optional().nullable(),
        dueDate: z2.date().optional().nullable()
      })
    ).mutation(async ({ input }) => {
      const { id, ...data } = input;
      const update = { ...data };
      if (data.status === "completed") {
        update.completedAt = /* @__PURE__ */ new Date();
      }
      await updateServiceProject(id, update);
      return { success: true };
    }),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
      await deleteServiceProject(input.id);
      return { success: true };
    }),
    expensesList: protectedProcedure.input(z2.object({ serviceProjectId: z2.number() })).query(async ({ input }) => {
      return listServiceProjectExpenses(input.serviceProjectId);
    }),
    expensesCreate: protectedProcedure.input(
      z2.object({
        serviceProjectId: z2.number(),
        amount: z2.number().int().min(0),
        currency: z2.string().min(1).max(10).default("SAR"),
        description: z2.string().optional().nullable(),
        expenseDate: z2.date().optional().nullable()
      })
    ).mutation(async ({ ctx, input }) => {
      const id = await createServiceProjectExpense({
        serviceProjectId: input.serviceProjectId,
        amount: input.amount,
        currency: input.currency,
        description: input.description ?? null,
        expenseDate: input.expenseDate ?? /* @__PURE__ */ new Date(),
        createdByUserId: ctx.user.id
      });
      return { id };
    }),
    expensesDelete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
      await deleteServiceProjectExpense(input.id);
      return { success: true };
    })
  }),
  publicSite: router({
    page: publicProcedure.input(z2.object({ slug: z2.string().min(1).max(100) })).query(async ({ input }) => {
      const organizationId = await getDefaultPublicOrganizationId();
      const page = await getSitePageBySlug({
        organizationId,
        slug: input.slug,
        onlyPublished: true
      });
      return page ?? null;
    }),
    team: publicProcedure.query(async () => {
      const organizationId = await getDefaultPublicOrganizationId();
      return listPublicTeamMembers(organizationId, true);
    }),
    practices: publicProcedure.query(async () => {
      const organizationId = await getDefaultPublicOrganizationId();
      return listPracticeAreas(organizationId, true);
    }),
    testimonials: publicProcedure.query(async () => {
      const organizationId = await getDefaultPublicOrganizationId();
      return listTestimonials(organizationId, true);
    })
  }),
  contact: router({
    createPublic: publicProcedure.input(
      z2.object({
        name: z2.string().min(1),
        email: z2.string().email().optional().nullable(),
        phone: z2.string().optional().nullable(),
        message: z2.string().min(1)
      })
    ).mutation(async ({ input }) => {
      const organizationId = await getDefaultPublicOrganizationId();
      const id = await createContactMessage({
        organizationId,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        message: input.message,
        status: "new"
      });
      return { id };
    })
  }),
  legalTools: router({
    translate: protectedProcedure.input(
      z2.object({
        text: z2.string().min(1),
        targetLanguage: z2.enum(["ar", "en"]).default("ar"),
        tone: z2.enum(["formal", "simple"]).default("formal")
      })
    ).mutation(async ({ ctx, input }) => {
      const { organizationId } = await assertToolAccess({ ctx, tool: "translate" });
      const system = `\u0623\u0646\u062A \u0645\u0633\u0627\u0639\u062F \u0645\u062A\u062E\u0635\u0635 \u0641\u064A \u0627\u0644\u062A\u0631\u062C\u0645\u0629 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064A\u0629.

- \u0627\u0644\u062A\u0632\u0645 \u0628\u0627\u0644\u062F\u0642\u0629\u060C \u0648\u062D\u0627\u0641\u0638 \u0639\u0644\u0649 \u0627\u0644\u0645\u0635\u0637\u0644\u062D\u0627\u062A \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064A\u0629.
- \u0625\u0630\u0627 \u0643\u0627\u0646 \u0627\u0644\u0646\u0635 \u064A\u062A\u0636\u0645\u0646 \u0645\u0635\u0637\u0644\u062D\u0627\u062A \u0642\u062F \u062A\u062D\u0645\u0644 \u0623\u0643\u062B\u0631 \u0645\u0646 \u0645\u0639\u0646\u0649\u060C \u0627\u0630\u0643\u0631 \u0627\u0644\u0628\u062F\u0627\u0626\u0644 \u0628\u064A\u0646 \u0642\u0648\u0633\u064A\u0646 \u0628\u0634\u0643\u0644 \u0645\u0648\u062C\u0632.
- \u0644\u0627 \u062A\u0642\u062F\u0651\u0645 \u0627\u0633\u062A\u0634\u0627\u0631\u0629 \u0642\u0627\u0646\u0648\u0646\u064A\u0629 \u0645\u0644\u0632\u0645\u0629.`;
      const user = `\u062A\u0631\u062C\u0645 \u0627\u0644\u0646\u0635 \u0627\u0644\u062A\u0627\u0644\u064A \u0625\u0644\u0649 ${input.targetLanguage === "ar" ? "\u0627\u0644\u0639\u0631\u0628\u064A\u0629" : "\u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629"} \u0628\u0623\u0633\u0644\u0648\u0628 ${input.tone === "formal" ? "\u0631\u0633\u0645\u064A" : "\u0645\u0628\u0633\u0651\u0637"}: 

${input.text}`;
      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ],
          outputSchema: {
            name: "LegalTranslation",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                translation: { type: "string" }
              },
              required: ["translation"]
            }
          }
        });
        const raw = response.choices[0]?.message?.content;
        const translation = typeof raw === "string" ? raw : Array.isArray(raw) && raw[0] && "text" in raw[0] ? raw[0].text : "";
        await incrementToolUsage({ organizationId, tool: "translate" });
        return { translation };
      } catch (error) {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        });
        const raw = response.choices[0]?.message?.content;
        const translation = typeof raw === "string" ? raw : "";
        await incrementToolUsage({ organizationId, tool: "translate" });
        return { translation };
      }
    }),
    compareTexts: protectedProcedure.input(
      z2.object({
        leftTitle: z2.string().optional().nullable(),
        rightTitle: z2.string().optional().nullable(),
        leftText: z2.string().min(1),
        rightText: z2.string().min(1),
        focus: z2.enum(["general", "risks", "differences", "compliance"]).default("general")
      })
    ).mutation(async ({ ctx, input }) => {
      const { organizationId } = await assertToolAccess({ ctx, tool: "compareTexts" });
      const system = `\u0623\u0646\u062A \u0645\u062D\u0644\u0644 \u0642\u0627\u0646\u0648\u0646\u064A.

\u0645\u0647\u0645\u062A\u0643 \u0645\u0642\u0627\u0631\u0646\u0629 \u0646\u0635\u064A\u0646/\u0648\u062B\u064A\u0642\u062A\u064A\u0646 \u0648\u0627\u0633\u062A\u062E\u0631\u0627\u062C \u0627\u0644\u0641\u0631\u0648\u0642\u0627\u062A \u0627\u0644\u062C\u0648\u0647\u0631\u064A\u0629 \u0648\u0627\u0644\u0645\u062E\u0627\u0637\u0631.
- \u0627\u0643\u062A\u0628 \u0627\u0644\u0645\u062E\u0631\u062C\u0627\u062A \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629.
- \u0644\u0627 \u062A\u0642\u062F\u0651\u0645 \u0627\u0633\u062A\u0634\u0627\u0631\u0629 \u0645\u0644\u0632\u0645\u0629.`;
      const user = `\u0642\u0627\u0631\u0646 \u0628\u064A\u0646 \u0627\u0644\u0646\u0635\u064A\u0646 \u0627\u0644\u062A\u0627\u0644\u064A\u064A\u0646. \u0631\u0643\u0651\u0632 \u0639\u0644\u0649: ${input.focus}.

\u0627\u0644\u0646\u0635 (A)${input.leftTitle ? ` - ${input.leftTitle}` : ""}:
${input.leftText}

\u0627\u0644\u0646\u0635 (B)${input.rightTitle ? ` - ${input.rightTitle}` : ""}:
${input.rightText}`;
      const response = await invokeLLM({ messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ] });
      const raw = response.choices[0]?.message?.content;
      await incrementToolUsage({ organizationId, tool: "compareTexts" });
      return { analysis: typeof raw === "string" ? raw : "" };
    }),
    predictCaseOutcome: protectedProcedure.input(
      z2.object({
        caseId: z2.number().optional().nullable(),
        caseSummary: z2.string().min(1)
      })
    ).mutation(async ({ ctx, input }) => {
      const { organizationId } = await assertToolAccess({ ctx, tool: "predictCaseOutcome" });
      let caseContext = "";
      if (input.caseId) {
        const caseData = await getCaseByIdForUser(ctx.user.id, input.caseId);
        if (caseData) {
          caseContext = `

\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0642\u0636\u064A\u0629 \u0628\u0627\u0644\u0646\u0638\u0627\u0645:
- \u0631\u0642\u0645 \u0627\u0644\u0642\u0636\u064A\u0629: ${caseData.caseNumber}
- \u0627\u0644\u0639\u0646\u0648\u0627\u0646: ${caseData.title}
- \u0627\u0644\u0646\u0648\u0639: ${caseData.type}
- \u0627\u0644\u0645\u062D\u0643\u0645\u0629: ${caseData.court || "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F"}
- \u0627\u0644\u0645\u0631\u062D\u0644\u0629: ${caseData.stage}
- \u0627\u0644\u062D\u0627\u0644\u0629: ${caseData.status}`;
        }
      }
      const system = `${SAUDI_LAW_SYSTEM_PROMPT}

\u0645\u0647\u0645\u0629 \u0625\u0636\u0627\u0641\u064A\u0629: \u0642\u062F\u0651\u0645 \u062A\u0648\u0642\u0639\u0627\u062A \u0639\u0627\u0645\u0629 \u063A\u064A\u0631 \u0645\u0644\u0632\u0645\u0629 \u0644\u0633\u064A\u0646\u0627\u0631\u064A\u0648\u0647\u0627\u062A \u0633\u064A\u0631 \u0627\u0644\u0642\u0636\u064A\u0629.
- \u0642\u062F\u0651\u0645 3 \u0633\u064A\u0646\u0627\u0631\u064A\u0648\u0647\u0627\u062A \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 (\u0645\u062A\u0641\u0627\u0626\u0644/\u0648\u0627\u0642\u0639\u064A/\u0645\u062A\u0634\u0627\u0626\u0645).
- \u0627\u0630\u0643\u0631 \u0627\u0644\u0639\u0648\u0627\u0645\u0644 \u0627\u0644\u062A\u064A \u0642\u062F \u062A\u063A\u064A\u0651\u0631 \u0627\u0644\u0646\u062A\u064A\u062C\u0629.
- \u0644\u0627 \u062A\u064F\u0635\u062F\u0631 \u062D\u0643\u0645\u064B\u0627 \u0648\u0644\u0627 \u062A\u0639\u062A\u0628\u0631\u0647 \u062A\u0648\u0642\u0639\u064B\u0627 \u062D\u062A\u0645\u064A\u064B\u0627.`;
      const user = `\u062D\u0644\u0651\u0644 \u0645\u0644\u062E\u0635 \u0627\u0644\u0642\u0636\u064A\u0629 \u0627\u0644\u062A\u0627\u0644\u064A \u0648\u0642\u062F\u0651\u0645 3 \u0633\u064A\u0646\u0627\u0631\u064A\u0648\u0647\u0627\u062A \u0645\u062A\u0648\u0642\u0639\u0629 \u0644\u0633\u064A\u0631\u0647\u0627 \u0648\u0646\u062A\u064A\u062C\u062A\u0647\u0627 \u0628\u0634\u0643\u0644 \u0639\u0627\u0645 (\u0628\u062F\u0648\u0646 \u062C\u0632\u0645):

${input.caseSummary}${caseContext}`;
      const response = await invokeLLM({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      });
      const raw = response.choices[0]?.message?.content;
      await incrementToolUsage({ organizationId, tool: "predictCaseOutcome" });
      return { analysis: typeof raw === "string" ? raw : "" };
    }),
    inheritanceEstimate: protectedProcedure.input(
      z2.object({
        scenario: z2.string().min(1)
      })
    ).mutation(async ({ ctx, input }) => {
      const { organizationId } = await assertToolAccess({ ctx, tool: "inheritanceEstimate" });
      const system = `\u0623\u0646\u062A \u0645\u0633\u0627\u0639\u062F \u0641\u064A \u0634\u0631\u062D \u0627\u0644\u0645\u0648\u0627\u0631\u064A\u062B \u0648\u0641\u0642 \u0627\u0644\u0623\u0646\u0638\u0645\u0629 \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629 (\u0623\u062D\u0643\u0627\u0645 \u0627\u0644\u0645\u0648\u0627\u0631\u064A\u062B \u0627\u0644\u0634\u0631\u0639\u064A\u0629) \u0628\u0634\u0643\u0644 \u062A\u0639\u0644\u064A\u0645\u064A \u0639\u0627\u0645.

- \u0642\u062F\u0651\u0645 \u0646\u062A\u064A\u062C\u0629 \u062A\u0642\u062F\u064A\u0631\u064A\u0629 \u0641\u0642\u0637 \u0648\u0642\u062F \u062A\u062A\u063A\u064A\u0631 \u062D\u0633\u0628 \u062A\u0641\u0627\u0635\u064A\u0644 \u062F\u0642\u064A\u0642\u0629.
- \u0627\u0637\u0644\u0628 \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0646\u0627\u0642\u0635\u0629 \u0625\u0630\u0627 \u0644\u0632\u0645.
- \u0627\u0630\u0643\u0631 \u062A\u0646\u0628\u064A\u0647\u064B\u0627 \u0648\u0627\u0636\u062D\u064B\u0627 \u0628\u0636\u0631\u0648\u0631\u0629 \u0645\u0631\u0627\u062C\u0639\u0629 \u0645\u062E\u062A\u0635.
- \u0627\u0643\u062A\u0628 \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629.`;
      const user = `\u0647\u0630\u0647 \u062D\u0627\u0644\u0629 \u062A\u0631\u0643\u0629/\u0645\u0648\u0627\u0631\u064A\u062B.

${input.scenario}

\u0627\u0644\u0645\u0637\u0644\u0648\u0628:
1) \u062A\u0644\u062E\u064A\u0635 \u0627\u0644\u0645\u0639\u0637\u064A\u0627\u062A.
2) \u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0648\u0631\u062B\u0629 \u0627\u0644\u0645\u062D\u062A\u0645\u0644\u064A\u0646 \u062D\u0633\u0628 \u0627\u0644\u0645\u0630\u0643\u0648\u0631.
3) \u062A\u0648\u0632\u064A\u0639 \u062A\u0642\u062F\u064A\u0631\u064A (\u0646\u0650\u0633\u064E\u0628) \u0625\u0646 \u0623\u0645\u0643\u0646.
4) \u0623\u0633\u0626\u0644\u0629 \u062A\u0648\u0636\u064A\u062D\u064A\u0629 \u0625\u0646 \u0643\u0627\u0646\u062A \u0627\u0644\u0645\u0639\u0637\u064A\u0627\u062A \u0646\u0627\u0642\u0635\u0629.
5) \u062A\u0646\u0628\u064A\u0647 \u0645\u0647\u0646\u064A \u0628\u0639\u062F\u0645 \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F \u0639\u0644\u0649 \u0627\u0644\u0646\u0627\u062A\u062C \u062F\u0648\u0646 \u0645\u062E\u062A\u0635.`;
      const response = await invokeLLM({ messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ] });
      const raw = response.choices[0]?.message?.content;
      await incrementToolUsage({ organizationId, tool: "inheritanceEstimate" });
      return { analysis: typeof raw === "string" ? raw : "" };
    })
  }),
  cms: router({
    pagesList: protectedProcedure.query(async ({ ctx }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      return listSitePagesByOrganizationId(organizationId);
    }),
    pageUpsert: protectedProcedure.input(
      z2.object({
        slug: z2.string().min(1).max(100),
        title: z2.string().min(1).max(255),
        content: z2.string().optional().nullable(),
        isPublished: z2.boolean().default(true)
      })
    ).mutation(async ({ ctx, input }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      const id = await upsertSitePage({
        organizationId,
        slug: input.slug,
        title: input.title,
        content: input.content ?? null,
        isPublished: input.isPublished,
        updatedByUserId: ctx.user.id
      });
      return { id };
    }),
    teamList: protectedProcedure.query(async ({ ctx }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      return listPublicTeamMembers(organizationId, false);
    }),
    teamCreate: protectedProcedure.input(
      z2.object({
        name: z2.string().min(1),
        title: z2.string().optional().nullable(),
        bio: z2.string().optional().nullable(),
        avatarUrl: z2.string().optional().nullable(),
        sortOrder: z2.number().int().min(0).default(0),
        isActive: z2.boolean().default(true)
      })
    ).mutation(async ({ ctx, input }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      const id = await createPublicTeamMember({
        organizationId,
        name: input.name,
        title: input.title ?? null,
        bio: input.bio ?? null,
        avatarUrl: input.avatarUrl ?? null,
        sortOrder: input.sortOrder,
        isActive: input.isActive
      });
      return { id };
    }),
    teamUpdate: protectedProcedure.input(
      z2.object({
        id: z2.number(),
        name: z2.string().min(1).optional(),
        title: z2.string().optional().nullable(),
        bio: z2.string().optional().nullable(),
        avatarUrl: z2.string().optional().nullable(),
        sortOrder: z2.number().int().min(0).optional(),
        isActive: z2.boolean().optional()
      })
    ).mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updatePublicTeamMember(id, data);
      return { success: true };
    }),
    practicesList: protectedProcedure.query(async ({ ctx }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      return listPracticeAreas(organizationId, false);
    }),
    practicesCreate: protectedProcedure.input(
      z2.object({
        title: z2.string().min(1),
        description: z2.string().optional().nullable(),
        sortOrder: z2.number().int().min(0).default(0),
        isActive: z2.boolean().default(true)
      })
    ).mutation(async ({ ctx, input }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      const id = await createPracticeArea({
        organizationId,
        title: input.title,
        description: input.description ?? null,
        sortOrder: input.sortOrder,
        isActive: input.isActive
      });
      return { id };
    }),
    practicesUpdate: protectedProcedure.input(
      z2.object({
        id: z2.number(),
        title: z2.string().min(1).optional(),
        description: z2.string().optional().nullable(),
        sortOrder: z2.number().int().min(0).optional(),
        isActive: z2.boolean().optional()
      })
    ).mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updatePracticeArea(id, data);
      return { success: true };
    }),
    testimonialsList: protectedProcedure.query(async ({ ctx }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      return listTestimonials(organizationId, false);
    }),
    testimonialsCreate: protectedProcedure.input(
      z2.object({
        clientName: z2.string().min(1),
        clientTitle: z2.string().optional().nullable(),
        content: z2.string().min(1),
        rating: z2.number().int().min(1).max(5).default(5),
        isPublished: z2.boolean().default(true)
      })
    ).mutation(async ({ ctx, input }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      const id = await createTestimonial({
        organizationId,
        clientName: input.clientName,
        clientTitle: input.clientTitle ?? null,
        content: input.content,
        rating: input.rating,
        isPublished: input.isPublished
      });
      return { id };
    }),
    testimonialsUpdate: protectedProcedure.input(
      z2.object({
        id: z2.number(),
        clientName: z2.string().min(1).optional(),
        clientTitle: z2.string().optional().nullable(),
        content: z2.string().min(1).optional(),
        rating: z2.number().int().min(1).max(5).optional(),
        isPublished: z2.boolean().optional()
      })
    ).mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateTestimonial(id, data);
      return { success: true };
    }),
    contactMessagesList: protectedProcedure.input(z2.object({ status: z2.enum(["new", "replied", "closed"]).optional() }).optional()).query(async ({ ctx, input }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      return listContactMessagesByOrganizationId(organizationId, input?.status);
    }),
    contactMessagesUpdateStatus: protectedProcedure.input(z2.object({ id: z2.number(), status: z2.enum(["new", "replied", "closed"]) })).mutation(async ({ input }) => {
      await updateContactMessageStatus(input.id, input.status);
      return { success: true };
    })
  }),
  blog: router({
    publicList: publicProcedure.query(async () => {
      const organizationId = await getDefaultPublicOrganizationId();
      return listBlogPostsByOrganizationId(organizationId, true);
    }),
    publicGetBySlug: publicProcedure.input(z2.object({ slug: z2.string().min(1).max(150) })).query(async ({ input }) => {
      const organizationId = await getDefaultPublicOrganizationId();
      const post = await getBlogPostBySlug({ organizationId, slug: input.slug, onlyPublished: true });
      return post ?? null;
    }),
    adminList: protectedProcedure.query(async ({ ctx }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      return listBlogPostsByOrganizationId(organizationId, false);
    }),
    adminUpsert: protectedProcedure.input(
      z2.object({
        slug: z2.string().min(1).max(150),
        title: z2.string().min(1).max(255),
        excerpt: z2.string().optional().nullable(),
        content: z2.string().optional().nullable(),
        isPublished: z2.boolean().default(true)
      })
    ).mutation(async ({ ctx, input }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      const id = await upsertBlogPost({
        organizationId,
        slug: input.slug,
        title: input.title,
        excerpt: input.excerpt ?? null,
        content: input.content ?? null,
        isPublished: input.isPublished,
        updatedByUserId: ctx.user.id
      });
      return { id };
    })
  }),
  // ==================== SUBSCRIPTIONS ====================
  subscriptions: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const { organizationId, plan, seatLimit } = await getOrganizationPlanForUser(ctx);
      const tools = toolEntitlementsByPlan[plan];
      const used = {
        translate: await getToolUsageCount({ organizationId, tool: "translate" }),
        compareTexts: await getToolUsageCount({ organizationId, tool: "compareTexts" }),
        predictCaseOutcome: await getToolUsageCount({ organizationId, tool: "predictCaseOutcome" }),
        inheritanceEstimate: await getToolUsageCount({ organizationId, tool: "inheritanceEstimate" })
      };
      const endsAtRaw = ctx.user?.subscriptionEndsAt;
      const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
      const isExpired = Boolean(endsAt && Number.isFinite(endsAt.getTime()) && endsAt.getTime() <= Date.now());
      const isActive = Boolean(ctx.user.isActive) && !isExpired;
      return {
        isActive,
        subscriptionEndsAt: endsAt,
        referralCode: ctx.user?.referralCode ?? null,
        organization: {
          id: organizationId,
          plan,
          seatLimit
        },
        toolEntitlements: {
          translate: {
            ...tools.translate,
            usedToday: used.translate,
            remaining: tools.translate.dailyLimit === null ? null : Math.max(tools.translate.dailyLimit - used.translate, 0)
          },
          compareTexts: {
            ...tools.compareTexts,
            usedToday: used.compareTexts,
            remaining: tools.compareTexts.dailyLimit === null ? null : Math.max(tools.compareTexts.dailyLimit - used.compareTexts, 0)
          },
          predictCaseOutcome: {
            ...tools.predictCaseOutcome,
            usedToday: used.predictCaseOutcome,
            remaining: tools.predictCaseOutcome.dailyLimit === null ? null : Math.max(tools.predictCaseOutcome.dailyLimit - used.predictCaseOutcome, 0)
          },
          inheritanceEstimate: {
            ...tools.inheritanceEstimate,
            usedToday: used.inheritanceEstimate,
            remaining: tools.inheritanceEstimate.dailyLimit === null ? null : Math.max(tools.inheritanceEstimate.dailyLimit - used.inheritanceEstimate, 0)
          }
        }
      };
    }),
    activate: protectedProcedure.input(
      z2.object({
        plan: z2.enum(["individual", "law_firm", "enterprise", "monthly"]).default("individual")
      }).optional()
    ).mutation(async ({ ctx, input }) => {
      if (ENV.isProduction && ctx.user.role !== "admin") {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0641\u064A \u0628\u064A\u0626\u0629 \u0627\u0644\u0625\u0646\u062A\u0627\u062C. \u064A\u0631\u062C\u0649 \u0625\u062A\u0645\u0627\u0645 \u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u062F\u0641\u0639 \u0639\u0628\u0631 \u0627\u0644\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629 \u0623\u0648 \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0644\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643."
        });
      }
      const requestedPlan = input?.plan ?? "individual";
      const normalizedPlan = requestedPlan === "monthly" ? "individual" : requestedPlan;
      const seatLimit = normalizedPlan === "law_firm" ? 5 : normalizedPlan === "enterprise" ? 15 : 1;
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      await setOrganizationSubscriptionPlan({
        organizationId,
        subscriptionPlan: normalizedPlan,
        seatLimit
      });
      await setUserActive(ctx.user.id, true);
      await setUserSubscriptionPlan({
        userId: ctx.user.id,
        subscriptionPlan: normalizedPlan,
        accountType: normalizedPlan,
        seatLimit
      });
      return {
        success: true,
        plan: normalizedPlan
      };
    }),
    activatePaid: protectedProcedure.input(
      z2.object({
        plan: z2.enum(["individual", "law_firm", "enterprise"]),
        paymentId: z2.string().min(10).max(128),
        promoCode: z2.string().max(64).optional().nullable(),
        referralCode: z2.string().max(24).optional().nullable()
      })
    ).mutation(async ({ ctx, input }) => {
      if (!ENV.moyasarSecretKey) {
        throw new TRPCError3({
          code: "PRECONDITION_FAILED",
          message: "\u0628\u0648\u0627\u0628\u0629 \u0627\u0644\u062F\u0641\u0639 \u063A\u064A\u0631 \u0645\u0647\u064A\u0623\u0629 \u062D\u0627\u0644\u064A\u0627\u064B. \u064A\u0631\u062C\u0649 \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0644\u062F\u0639\u0645."
        });
      }
      const expectedAmount = input.plan === "enterprise" ? 8999 * 100 : input.plan === "law_firm" ? 4599 * 100 : 1549 * 100;
      let payment;
      try {
        const { data } = await axios4.get(
          `https://api.moyasar.com/v1/payments/${encodeURIComponent(input.paymentId)}`,
          {
            auth: {
              username: ENV.moyasarSecretKey,
              password: ""
            },
            timeout: 15e3
          }
        );
        payment = data;
      } catch (e) {
        const status = e?.response?.status;
        if (status === 401 || status === 403) {
          throw new TRPCError3({
            code: "PRECONDITION_FAILED",
            message: "\u062A\u0639\u0630\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0628\u0648\u0627\u0628\u0629 \u0627\u0644\u062F\u0641\u0639. \u062A\u062D\u0642\u0642 \u0645\u0646 \u0645\u0641\u0627\u062A\u064A\u062D Moyasar."
          });
        }
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u062F\u0641\u0639."
        });
      }
      if (!payment?.id || payment.id !== input.paymentId) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: "\u0645\u0639\u0631\u0641 \u0627\u0644\u062F\u0641\u0639 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D." });
      }
      const okStatus = payment.status === "paid" || payment.status === "captured";
      if (!okStatus) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "\u062D\u0627\u0644\u0629 \u0627\u0644\u062F\u0641\u0639 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629."
        });
      }
      if (payment.currency !== "SAR") {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "\u0639\u0645\u0644\u0629 \u0627\u0644\u062F\u0641\u0639 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629."
        });
      }
      if (payment.amount !== expectedAmount) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "\u0645\u0628\u0644\u063A \u0627\u0644\u062F\u0641\u0639 \u063A\u064A\u0631 \u0645\u0637\u0627\u0628\u0642 \u0644\u0644\u062E\u0637\u0629 \u0627\u0644\u0645\u062E\u062A\u0627\u0631\u0629."
        });
      }
      const paidPlanFromMeta = (payment.metadata?.plan ?? "").trim();
      if (paidPlanFromMeta && paidPlanFromMeta !== input.plan) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "\u0627\u0644\u062E\u0637\u0629 \u0641\u064A \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u0641\u0639 \u0644\u0627 \u062A\u0637\u0627\u0628\u0642 \u0627\u0644\u062E\u0637\u0629 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629."
        });
      }
      const paymentRecorded = await createSubscriptionPayment({
        userId: ctx.user.id,
        paymentId: payment.id,
        plan: input.plan
      });
      const seatLimit = input.plan === "enterprise" ? 15 : input.plan === "law_firm" ? 5 : 1;
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      await setOrganizationSubscriptionPlan({
        organizationId,
        subscriptionPlan: input.plan,
        seatLimit
      });
      await setUserActive(ctx.user.id, true);
      await setUserSubscriptionPlan({
        userId: ctx.user.id,
        subscriptionPlan: input.plan,
        accountType: input.plan,
        seatLimit
      });
      if (paymentRecorded) {
        await extendUserSubscription({ userId: ctx.user.id, extendDays: 365 });
        const configuredPromoRaw = await getAppSetting("promoCode");
        const configuredPromo = typeof configuredPromoRaw === "string" ? configuredPromoRaw.trim().toUpperCase() : "";
        const requestedPromo = (input.promoCode ?? "").trim().toUpperCase();
        if (requestedPromo && configuredPromo && requestedPromo === configuredPromo) {
          const alreadyUsedPromo = await hasPromoRedemptionForUser(ctx.user.id);
          if (!alreadyUsedPromo) {
            await createPromoRedemption({
              userId: ctx.user.id,
              paymentId: payment.id,
              promoCode: requestedPromo
            });
            await extendUserSubscription({ userId: ctx.user.id, extendDays: 30 });
          }
        }
        const requestedReferral = (input.referralCode ?? "").trim().toUpperCase();
        if (requestedReferral) {
          const referrer = await getUserByReferralCode(requestedReferral);
          const alreadyUsedReferral = await hasReferralRedemptionForReferredUser(ctx.user.id);
          if (referrer && referrer.id && Number(referrer.id) !== Number(ctx.user.id) && !alreadyUsedReferral) {
            await createReferralRedemption({
              referrerUserId: Number(referrer.id),
              referredUserId: ctx.user.id,
              paymentId: payment.id,
              referralCode: requestedReferral
            });
            await extendUserSubscription({ userId: Number(referrer.id), extendDays: 30 });
          }
        }
      }
      return {
        success: true,
        plan: input.plan,
        paymentId: payment.id,
        applied: {
          paymentRecorded
        }
      };
    })
  }),
  // ==================== DASHBOARD ====================
  dashboard: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      return getDashboardStatsForUser(ctx.user.id);
    }),
    upcomingHearings: protectedProcedure.query(async ({ ctx }) => {
      return getUpcomingHearingsForUser(ctx.user.id, 7);
    }),
    recentCases: protectedProcedure.query(async ({ ctx }) => {
      const cases2 = await getAllCasesByUserId(ctx.user.id);
      return cases2.slice(0, 5);
    })
  }),
  reports: router({
    stats: protectedProcedure.input(
      z2.object({
        range: z2.enum(["week", "month", "quarter", "year"]).optional()
      }).optional()
    ).query(async ({ input, ctx }) => {
      return getReportsStatsForUser(ctx.user.id, input?.range);
    })
  }),
  // ==================== CLIENT PORTAL (Public, token-based) ====================
  portal: router({
    get: publicProcedure.input(z2.object({ token: z2.string().min(10).max(128) })).query(async ({ input }) => {
      const client = await getClientByPortalToken(input.token);
      if (!client) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0631\u0627\u0628\u0637 \u0627\u0644\u0628\u0648\u0627\u0628\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
      }
      const clientId = Number(client.id);
      const cases2 = await getCasesByClientId(clientId);
      const hearings2 = await getHearingsByClientId(clientId);
      const invoices2 = await getInvoicesByClientId(clientId);
      const payments2 = await getPaymentsByClientId(clientId);
      const documents2 = await getSharedDocumentsByClientId(clientId);
      const timeline = [];
      for (const c of cases2) {
        timeline.push({
          kind: "case",
          at: c.createdAt,
          id: c.id,
          title: c.title,
          meta: { status: c.status, caseNumber: c.caseNumber }
        });
      }
      for (const h of hearings2) {
        timeline.push({
          kind: "hearing",
          at: h.hearingDate,
          id: h.id,
          title: h.title,
          meta: { status: h.status, caseId: h.caseId }
        });
      }
      for (const i of invoices2) {
        timeline.push({
          kind: "invoice",
          at: i.createdAt,
          id: i.id,
          title: `\u0641\u0627\u062A\u0648\u0631\u0629 #${i.invoiceNumber}`,
          meta: { status: i.status, totalAmount: i.totalAmount, currency: i.currency }
        });
      }
      for (const p of payments2) {
        timeline.push({
          kind: "payment",
          at: p.paidAt,
          id: p.id,
          title: "\u062F\u0641\u0639\u0629",
          meta: { amount: p.amount, currency: p.currency, invoiceId: p.invoiceId, method: p.method }
        });
      }
      for (const d of documents2) {
        timeline.push({
          kind: "document",
          at: d.createdAt,
          id: d.id,
          title: d.name,
          meta: { type: d.type }
        });
      }
      timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      return {
        client: {
          id: clientId,
          name: client.name
        },
        cases: cases2,
        hearings: hearings2,
        invoices: invoices2,
        payments: payments2,
        documents: documents2,
        timeline
      };
    })
  }),
  // ==================== CLIENTS ====================
  clients: router({
    list: protectedProcedure.input(z2.object({ search: z2.string().optional() }).optional()).query(async ({ input, ctx }) => {
      return getAllClientsByUserId(ctx.user.id, input?.search);
    }),
    getById: protectedProcedure.input(z2.object({ id: z2.number() })).query(async ({ input, ctx }) => {
      return getClientByIdForUser(ctx.user.id, input.id);
    }),
    create: protectedProcedure.input(z2.object({
      name: z2.string().min(1),
      nameEn: z2.string().optional(),
      type: z2.enum(["individual", "company", "government"]),
      email: z2.string().email().optional().nullable(),
      phone: z2.string().optional().nullable(),
      secondaryPhone: z2.string().optional().nullable(),
      nationalId: z2.string().optional().nullable(),
      commercialRegister: z2.string().optional().nullable(),
      address: z2.string().optional().nullable(),
      city: z2.string().optional().nullable(),
      notes: z2.string().optional().nullable()
    })).mutation(async ({ input, ctx }) => {
      const id = await createClient({
        ...input,
        createdById: ctx.user.id
      });
      await logActivity({
        userId: ctx.user.id,
        action: "create",
        entityType: "client",
        entityId: id,
        newData: JSON.stringify(input),
        description: `\u062A\u0645 \u0625\u0636\u0627\u0641\u0629 \u0639\u0645\u064A\u0644: ${input.name}`
      });
      return { id };
    }),
    update: protectedProcedure.input(z2.object({
      id: z2.number(),
      name: z2.string().min(1).optional(),
      nameEn: z2.string().optional().nullable(),
      type: z2.enum(["individual", "company", "government"]).optional(),
      email: z2.string().email().optional().nullable(),
      phone: z2.string().optional().nullable(),
      secondaryPhone: z2.string().optional().nullable(),
      nationalId: z2.string().optional().nullable(),
      commercialRegister: z2.string().optional().nullable(),
      address: z2.string().optional().nullable(),
      city: z2.string().optional().nullable(),
      notes: z2.string().optional().nullable()
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const oldClient = await getClientByIdForUser(ctx.user.id, id);
      if (!oldClient) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u0639\u0645\u064A\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
      }
      await updateClient(id, data);
      await logActivity({
        userId: ctx.user.id,
        action: "update",
        entityType: "client",
        entityId: id,
        oldData: JSON.stringify(oldClient),
        newData: JSON.stringify(data),
        description: `\u062A\u0645 \u062A\u0639\u062F\u064A\u0644 \u0639\u0645\u064A\u0644: ${oldClient.name}`
      });
      return { success: true };
    }),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ input, ctx }) => {
      const oldClient = await getClientByIdForUser(ctx.user.id, input.id);
      if (!oldClient) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u0639\u0645\u064A\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
      }
      await deleteClient(input.id);
      await logActivity({
        userId: ctx.user.id,
        action: "delete",
        entityType: "client",
        entityId: input.id,
        oldData: JSON.stringify(oldClient),
        description: `\u062A\u0645 \u062D\u0630\u0641 \u0639\u0645\u064A\u0644: ${oldClient.name}`
      });
      return { success: true };
    }),
    getCases: protectedProcedure.input(z2.object({ clientId: z2.number() })).query(async ({ input, ctx }) => {
      return getCasesByClientIdForUser(ctx.user.id, input.clientId);
    }),
    getDocuments: protectedProcedure.input(z2.object({ clientId: z2.number() })).query(async ({ input, ctx }) => {
      return getDocumentsByClientIdForUser(ctx.user.id, input.clientId);
    }),
    getInvoices: protectedProcedure.input(z2.object({ clientId: z2.number() })).query(async ({ input, ctx }) => {
      return getInvoicesByClientIdForUser(ctx.user.id, input.clientId);
    }),
    getCommunicationLogs: protectedProcedure.input(z2.object({ clientId: z2.number() })).query(async ({ input, ctx }) => {
      return getCommunicationLogsByClientIdForUser(ctx.user.id, input.clientId);
    }),
    portalGenerate: protectedProcedure.input(z2.object({ clientId: z2.number() })).mutation(async ({ input, ctx }) => {
      const client = await getClientByIdForUser(ctx.user.id, input.clientId);
      if (!client) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u0639\u0645\u064A\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
      }
      const token = nanoid(40);
      await updateClient(input.clientId, {
        portalToken: token,
        portalEnabled: true
      });
      return { token };
    }),
    portalDisable: protectedProcedure.input(z2.object({ clientId: z2.number() })).mutation(async ({ input, ctx }) => {
      const client = await getClientByIdForUser(ctx.user.id, input.clientId);
      if (!client) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u0639\u0645\u064A\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
      }
      await updateClient(input.clientId, {
        portalEnabled: false,
        portalToken: null
      });
      return { success: true };
    })
  }),
  // ==================== CASES ====================
  cases: router({
    list: protectedProcedure.input(z2.object({
      status: z2.string().optional(),
      type: z2.string().optional(),
      search: z2.string().optional()
    }).optional()).query(async ({ input, ctx }) => {
      return getAllCasesByUserId(ctx.user.id, input);
    }),
    getById: protectedProcedure.input(z2.object({ id: z2.number() })).query(async ({ input, ctx }) => {
      return getCaseByIdForUser(ctx.user.id, input.id);
    }),
    create: protectedProcedure.input(z2.object({
      caseNumber: z2.string().min(1),
      title: z2.string().min(1),
      description: z2.string().optional().nullable(),
      type: z2.enum(["criminal", "commercial", "family", "administrative", "labor", "real_estate", "other"]),
      court: z2.string().optional().nullable(),
      courtBranch: z2.string().optional().nullable(),
      stage: z2.enum(["intake", "filing", "discovery", "hearing", "judgment", "appeal", "execution", "closed"]).optional(),
      status: z2.enum(["active", "pending", "on_hold", "won", "lost", "settled", "closed"]).optional(),
      priority: z2.enum(["low", "medium", "high", "urgent"]).optional(),
      clientId: z2.number(),
      assignedLawyerId: z2.number().optional().nullable(),
      opposingParty: z2.string().optional().nullable(),
      opposingLawyer: z2.string().optional().nullable(),
      filingDate: z2.date().optional().nullable(),
      estimatedValue: z2.number().optional().nullable(),
      notes: z2.string().optional().nullable()
    })).mutation(async ({ input, ctx }) => {
      const ownedClient = await getClientByIdForUser(ctx.user.id, input.clientId);
      if (!ownedClient) {
        throw new TRPCError3({ code: "FORBIDDEN", message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" });
      }
      const id = await createCase(input);
      return { id };
    }),
    update: protectedProcedure.input(z2.object({
      id: z2.number(),
      caseNumber: z2.string().min(1).optional(),
      title: z2.string().min(1).optional(),
      description: z2.string().optional().nullable(),
      type: z2.enum(["criminal", "commercial", "family", "administrative", "labor", "real_estate", "other"]).optional(),
      court: z2.string().optional().nullable(),
      courtBranch: z2.string().optional().nullable(),
      stage: z2.enum(["intake", "filing", "discovery", "hearing", "judgment", "appeal", "execution", "closed"]).optional(),
      status: z2.enum(["active", "pending", "on_hold", "won", "lost", "settled", "closed"]).optional(),
      priority: z2.enum(["low", "medium", "high", "urgent"]).optional(),
      assignedLawyerId: z2.number().optional().nullable(),
      opposingParty: z2.string().optional().nullable(),
      opposingLawyer: z2.string().optional().nullable(),
      filingDate: z2.date().optional().nullable(),
      nextHearingDate: z2.date().optional().nullable(),
      closingDate: z2.date().optional().nullable(),
      estimatedValue: z2.number().optional().nullable(),
      actualValue: z2.number().optional().nullable(),
      notes: z2.string().optional().nullable()
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const ownedCase = await getCaseByIdForUser(ctx.user.id, id);
      if (!ownedCase) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u0642\u0636\u064A\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629" });
      }
      await updateCase(id, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ input, ctx }) => {
      const ownedCase = await getCaseByIdForUser(ctx.user.id, input.id);
      if (!ownedCase) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u0642\u0636\u064A\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629" });
      }
      await deleteCase(input.id);
      return { success: true };
    }),
    getHearings: protectedProcedure.input(z2.object({ caseId: z2.number() })).query(async ({ input, ctx }) => {
      const ownedCase = await getCaseByIdForUser(ctx.user.id, input.caseId);
      if (!ownedCase) return [];
      return getHearingsByCaseId(input.caseId);
    }),
    getDocuments: protectedProcedure.input(z2.object({ caseId: z2.number() })).query(async ({ input, ctx }) => {
      return getDocumentsByCaseIdForUser(ctx.user.id, input.caseId);
    }),
    getTasks: protectedProcedure.input(z2.object({ caseId: z2.number() })).query(async ({ input, ctx }) => {
      const ownedCase = await getCaseByIdForUser(ctx.user.id, input.caseId);
      if (!ownedCase) return [];
      return getTasksByCaseId(input.caseId);
    }),
    getTimeEntries: protectedProcedure.input(z2.object({ caseId: z2.number() })).query(async ({ input, ctx }) => {
      return getTimeEntriesByCaseIdForUser(ctx.user.id, input.caseId);
    }),
    stats: protectedProcedure.query(async ({ ctx }) => {
      return getCaseStatsForUser(ctx.user.id);
    })
  }),
  // ==================== HEARINGS ====================
  hearings: router({
    list: protectedProcedure.input(z2.object({
      startDate: z2.date().optional(),
      endDate: z2.date().optional()
    }).optional()).query(async ({ input, ctx }) => {
      return getHearingsByDateRangeForUser(ctx.user.id, input?.startDate, input?.endDate);
    }),
    create: protectedProcedure.input(z2.object({
      caseId: z2.number(),
      title: z2.string().min(1),
      description: z2.string().optional().nullable(),
      hearingDate: z2.date(),
      location: z2.string().optional().nullable(),
      courtRoom: z2.string().optional().nullable(),
      notes: z2.string().optional().nullable()
    })).mutation(async ({ input, ctx }) => {
      const ownedCase = await getCaseByIdForUser(ctx.user.id, input.caseId);
      if (!ownedCase) {
        throw new TRPCError3({ code: "FORBIDDEN", message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" });
      }
      const id = await createHearing({
        ...input,
        status: "scheduled"
      });
      return { id };
    }),
    update: protectedProcedure.input(z2.object({
      id: z2.number(),
      title: z2.string().min(1).optional(),
      description: z2.string().optional().nullable(),
      hearingDate: z2.date().optional(),
      location: z2.string().optional().nullable(),
      courtRoom: z2.string().optional().nullable(),
      status: z2.enum(["scheduled", "completed", "postponed", "cancelled"]).optional(),
      outcome: z2.string().optional().nullable(),
      notes: z2.string().optional().nullable()
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const ownedHearing = await getHearingByIdForUser(ctx.user.id, id);
      if (!ownedHearing) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u062C\u0644\u0633\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629" });
      }
      await updateHearing(id, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ input, ctx }) => {
      const ownedHearing = await getHearingByIdForUser(ctx.user.id, input.id);
      if (!ownedHearing) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u062C\u0644\u0633\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629" });
      }
      await deleteHearing(input.id);
      return { success: true };
    }),
    upcoming: protectedProcedure.input(z2.object({ days: z2.number().optional() }).optional()).query(async ({ input, ctx }) => {
      return getUpcomingHearingsForUser(ctx.user.id, input?.days ?? 7);
    })
  }),
  // ==================== DOCUMENTS ====================
  documents: router({
    list: protectedProcedure.input(z2.object({ search: z2.string().optional() }).optional()).query(async ({ input, ctx }) => {
      return getAllDocumentsForUser(ctx.user.id, input?.search);
    }),
    getById: protectedProcedure.input(z2.object({ id: z2.number() })).query(async ({ input, ctx }) => {
      return getDocumentByIdForUser(ctx.user.id, input.id);
    }),
    create: protectedProcedure.input(z2.object({
      name: z2.string().min(1),
      description: z2.string().optional().nullable(),
      type: z2.enum(["contract", "memo", "pleading", "evidence", "correspondence", "court_order", "power_of_attorney", "other"]),
      fileUrl: z2.string(),
      fileKey: z2.string(),
      mimeType: z2.string().optional().nullable(),
      fileSize: z2.number().optional().nullable(),
      caseId: z2.number().optional().nullable(),
      clientId: z2.number().optional().nullable(),
      serviceProjectId: z2.number().optional().nullable(),
      isTemplate: z2.boolean().optional(),
      isSharedWithClient: z2.boolean().optional(),
      templateCategory: z2.string().optional().nullable(),
      expiresAt: z2.date().optional().nullable(),
      renewAt: z2.date().optional().nullable(),
      reminderDays: z2.number().int().min(1).max(365).optional().nullable()
    })).mutation(async ({ input, ctx }) => {
      if (input.caseId) {
        const ownedCase = await getCaseByIdForUser(ctx.user.id, input.caseId);
        if (!ownedCase) {
          throw new TRPCError3({ code: "FORBIDDEN", message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" });
        }
      }
      if (input.clientId) {
        const ownedClient = await getClientByIdForUser(ctx.user.id, input.clientId);
        if (!ownedClient) {
          throw new TRPCError3({ code: "FORBIDDEN", message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" });
        }
      }
      const id = await createDocument({
        ...input,
        uploadedById: ctx.user.id,
        version: 1
      });
      return { id };
    }),
    update: protectedProcedure.input(z2.object({
      id: z2.number(),
      name: z2.string().min(1).optional(),
      description: z2.string().optional().nullable(),
      type: z2.enum(["contract", "memo", "pleading", "evidence", "correspondence", "court_order", "power_of_attorney", "other"]).optional(),
      serviceProjectId: z2.number().optional().nullable(),
      isTemplate: z2.boolean().optional(),
      isSharedWithClient: z2.boolean().optional(),
      templateCategory: z2.string().optional().nullable(),
      expiresAt: z2.date().optional().nullable(),
      renewAt: z2.date().optional().nullable(),
      reminderDays: z2.number().int().min(1).max(365).optional().nullable()
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const owned = await getDocumentByIdForUser(ctx.user.id, id);
      if (!owned) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u0645\u0633\u062A\u0646\u062F \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
      }
      await updateDocument(id, data);
      return { success: true };
    }),
    createFromTemplate: protectedProcedure.input(
      z2.object({
        templateId: z2.number(),
        name: z2.string().min(1).optional(),
        description: z2.string().optional().nullable(),
        caseId: z2.number().optional().nullable(),
        clientId: z2.number().optional().nullable(),
        expiresAt: z2.date().optional().nullable(),
        renewAt: z2.date().optional().nullable(),
        reminderDays: z2.number().int().min(1).max(365).optional().nullable()
      })
    ).mutation(async ({ input, ctx }) => {
      const template = await getDocumentByIdForUser(ctx.user.id, input.templateId);
      if (!template || !template.isTemplate) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "\u0627\u0644\u0642\u0627\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F"
        });
      }
      if (input.caseId) {
        const ownedCase = await getCaseByIdForUser(ctx.user.id, input.caseId);
        if (!ownedCase) {
          throw new TRPCError3({ code: "FORBIDDEN", message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" });
        }
      }
      if (input.clientId) {
        const ownedClient = await getClientByIdForUser(ctx.user.id, input.clientId);
        if (!ownedClient) {
          throw new TRPCError3({ code: "FORBIDDEN", message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" });
        }
      }
      const id = await createDocument({
        name: input.name ?? template.name,
        description: input.description ?? null,
        type: template.type,
        fileUrl: template.fileUrl,
        fileKey: template.fileKey,
        mimeType: template.mimeType ?? null,
        fileSize: template.fileSize ?? null,
        caseId: input.caseId ?? null,
        clientId: input.clientId ?? null,
        version: 1,
        parentDocumentId: template.id,
        isTemplate: false,
        templateCategory: template.templateCategory ?? null,
        expiresAt: input.expiresAt ?? null,
        renewAt: input.renewAt ?? null,
        reminderDays: input.reminderDays ?? template.reminderDays ?? 30,
        lastReminderSentAt: null,
        uploadedById: ctx.user.id
      });
      return { id };
    }),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ input, ctx }) => {
      const owned = await getDocumentByIdForUser(ctx.user.id, input.id);
      if (!owned) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u0645\u0633\u062A\u0646\u062F \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
      }
      await deleteDocument(input.id);
      return { success: true };
    }),
    templates: protectedProcedure.query(async ({ ctx }) => {
      return getDocumentTemplatesForUser(ctx.user.id);
    })
  }),
  // ==================== TASKS ====================
  tasks: router({
    list: protectedProcedure.input(z2.object({
      status: z2.string().optional(),
      priority: z2.string().optional()
    }).optional()).query(async ({ input, ctx }) => {
      return getAllTasksForUser(ctx.user.id, input);
    }),
    create: protectedProcedure.input(z2.object({
      title: z2.string().min(1),
      description: z2.string().optional().nullable(),
      caseId: z2.number().optional().nullable(),
      serviceProjectId: z2.number().optional().nullable(),
      assignedToId: z2.number().optional().nullable(),
      dueDate: z2.date().optional().nullable(),
      priority: z2.enum(["low", "medium", "high", "urgent"]).optional()
    })).mutation(async ({ input, ctx }) => {
      if (input.caseId) {
        const ownedCase = await getCaseByIdForUser(ctx.user.id, input.caseId);
        if (!ownedCase) {
          throw new TRPCError3({ code: "FORBIDDEN", message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" });
        }
      }
      const id = await createTask({
        ...input,
        assignedById: ctx.user.id,
        status: "pending"
      });
      return { id };
    }),
    update: protectedProcedure.input(z2.object({
      id: z2.number(),
      title: z2.string().min(1).optional(),
      description: z2.string().optional().nullable(),
      assignedToId: z2.number().optional().nullable(),
      dueDate: z2.date().optional().nullable(),
      priority: z2.enum(["low", "medium", "high", "urgent"]).optional(),
      status: z2.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
      serviceProjectId: z2.number().optional().nullable()
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const owned = await getTaskByIdForUser(ctx.user.id, id);
      if (!owned) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u0645\u0647\u0645\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629" });
      }
      if (data.status === "completed") {
        data.completedAt = /* @__PURE__ */ new Date();
      }
      await updateTask(id, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ input, ctx }) => {
      const owned = await getTaskByIdForUser(ctx.user.id, input.id);
      if (!owned) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u0645\u0647\u0645\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629" });
      }
      await deleteTask(input.id);
      return { success: true };
    }),
    myTasks: protectedProcedure.query(async ({ ctx }) => {
      return getTasksByUserId(ctx.user.id);
    })
  }),
  // ==================== INVOICES ====================
  invoices: router({
    list: protectedProcedure.input(z2.object({ status: z2.string().optional() }).optional()).query(async ({ input, ctx }) => {
      return getAllInvoicesForUser(ctx.user.id, input?.status);
    }),
    getById: protectedProcedure.input(z2.object({ id: z2.number() })).query(async ({ input, ctx }) => {
      return getInvoiceByIdForUser(ctx.user.id, input.id);
    }),
    create: protectedProcedure.input(z2.object({
      clientId: z2.number(),
      caseId: z2.number().optional().nullable(),
      serviceProjectId: z2.number().optional().nullable(),
      amount: z2.number(),
      taxAmount: z2.number().optional(),
      currency: z2.string().optional(),
      feeType: z2.enum(["hourly", "fixed", "percentage", "retainer"]),
      description: z2.string().optional().nullable(),
      dueDate: z2.date().optional().nullable()
    })).mutation(async ({ input, ctx }) => {
      const ownedClient = await getClientByIdForUser(ctx.user.id, input.clientId);
      if (!ownedClient) {
        throw new TRPCError3({ code: "FORBIDDEN", message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" });
      }
      if (input.caseId) {
        const ownedCase = await getCaseByIdForUser(ctx.user.id, input.caseId);
        if (!ownedCase) {
          throw new TRPCError3({ code: "FORBIDDEN", message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" });
        }
      }
      const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      const taxAmount = input.taxAmount ?? Math.round(input.amount * 0.15);
      const totalAmount = input.amount + taxAmount;
      const id = await createInvoice({
        ...input,
        invoiceNumber,
        taxAmount,
        totalAmount,
        status: "draft",
        createdById: ctx.user.id
      });
      return { id, invoiceNumber };
    }),
    update: protectedProcedure.input(z2.object({
      id: z2.number(),
      amount: z2.number().optional(),
      taxAmount: z2.number().optional(),
      status: z2.enum(["draft", "sent", "paid", "partial", "overdue", "cancelled"]).optional(),
      description: z2.string().optional().nullable(),
      dueDate: z2.date().optional().nullable(),
      serviceProjectId: z2.number().optional().nullable()
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const owned = await getInvoiceByIdForUser(ctx.user.id, id);
      if (!owned) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629" });
      }
      if (data.amount !== void 0) {
        const taxAmount = data.taxAmount ?? Math.round(data.amount * 0.15);
        data.totalAmount = data.amount + taxAmount;
      }
      await updateInvoice(id, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ input, ctx }) => {
      const owned = await getInvoiceByIdForUser(ctx.user.id, input.id);
      if (!owned) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629" });
      }
      await deleteInvoice(input.id);
      return { success: true };
    }),
    addPayment: protectedProcedure.input(z2.object({
      invoiceId: z2.number(),
      amount: z2.number(),
      method: z2.enum(["cash", "bank_transfer", "credit_card", "stc_pay", "stripe", "other"]),
      transactionId: z2.string().optional().nullable(),
      notes: z2.string().optional().nullable()
    })).mutation(async ({ input, ctx }) => {
      const ownedInvoice = await getInvoiceByIdForUser(ctx.user.id, input.invoiceId);
      if (!ownedInvoice) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629" });
      }
      await createPayment(input);
      const invoice = await getInvoiceByIdForUser(ctx.user.id, input.invoiceId);
      if (invoice) {
        const newPaidAmount = (invoice.paidAmount ?? 0) + input.amount;
        const newStatus = newPaidAmount >= invoice.totalAmount ? "paid" : "partial";
        await updateInvoice(input.invoiceId, {
          paidAmount: newPaidAmount,
          status: newStatus,
          paidDate: newStatus === "paid" ? /* @__PURE__ */ new Date() : void 0
        });
      }
      return { success: true };
    }),
    getPayments: protectedProcedure.input(z2.object({ invoiceId: z2.number() })).query(async ({ input, ctx }) => {
      return getPaymentsByInvoiceIdForUser(ctx.user.id, input.invoiceId);
    }),
    stats: protectedProcedure.query(async ({ ctx }) => {
      return getInvoiceStatsForUser(ctx.user.id);
    })
  }),
  // ==================== CALENDAR ====================
  calendar: router({
    events: protectedProcedure.input(z2.object({
      startDate: z2.date(),
      endDate: z2.date()
    })).query(async ({ input, ctx }) => {
      return getCalendarEventsByDateRangeForUser(ctx.user.id, input.startDate, input.endDate);
    }),
    create: protectedProcedure.input(z2.object({
      title: z2.string().min(1),
      description: z2.string().optional().nullable(),
      eventType: z2.enum(["hearing", "meeting", "deadline", "reminder", "other"]),
      startTime: z2.date(),
      endTime: z2.date().optional().nullable(),
      allDay: z2.boolean().optional(),
      location: z2.string().optional().nullable(),
      caseId: z2.number().optional().nullable(),
      reminderMinutes: z2.number().optional()
    })).mutation(async ({ input, ctx }) => {
      if (input.caseId) {
        const ownedCase = await getCaseByIdForUser(ctx.user.id, input.caseId);
        if (!ownedCase) {
          throw new TRPCError3({ code: "FORBIDDEN", message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" });
        }
      }
      const id = await createCalendarEvent({
        ...input,
        userId: ctx.user.id
      });
      return { id };
    }),
    update: protectedProcedure.input(z2.object({
      id: z2.number(),
      title: z2.string().min(1).optional(),
      description: z2.string().optional().nullable(),
      eventType: z2.enum(["hearing", "meeting", "deadline", "reminder", "other"]).optional(),
      startTime: z2.date().optional(),
      endTime: z2.date().optional().nullable(),
      allDay: z2.boolean().optional(),
      location: z2.string().optional().nullable()
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const owned = await getCalendarEventByIdForUser(ctx.user.id, id);
      if (!owned) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u062D\u062F\u062B \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
      }
      await updateCalendarEvent(id, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ input, ctx }) => {
      const owned = await getCalendarEventByIdForUser(ctx.user.id, input.id);
      if (!owned) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u062D\u062F\u062B \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
      }
      await deleteCalendarEvent(input.id);
      return { success: true };
    })
  }),
  // ==================== AI ASSISTANT ====================
  ai: router({
    chat: protectedProcedure.input(z2.object({
      message: z2.string().min(1),
      sessionId: z2.string().optional(),
      caseId: z2.number().optional().nullable()
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user && ctx.user.isActive === false) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "\u064A\u062A\u0637\u0644\u0628 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064A \u0627\u0644\u0630\u0643\u064A \u0627\u0634\u062A\u0631\u0627\u0643\u0627\u064B \u0633\u0646\u0648\u064A\u0627\u064B \u0641\u0639\u0627\u0644\u0627\u064B. \u064A\u0631\u062C\u0649 \u0627\u0644\u0627\u0646\u062A\u0642\u0627\u0644 \u0625\u0644\u0649 \u0635\u0641\u062D\u0629 \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0627\u062A \u0644\u062A\u062C\u062F\u064A\u062F \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643."
        });
      }
      console.log("[AI] Chat mutation started");
      console.log("[AI] User ID:", ctx.user.id);
      console.log("[AI] Message:", input.message);
      const sessionId = input.sessionId || nanoid();
      const normalizedMsg = input.message.replace(/[٠-٩]/g, (d) => String("\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".indexOf(d))).replace(/\s+/g, " ").trim();
      const isSmallTalk = /^(كيف\s*حالك|كيف\s*حال(?:ك|كم)|السلام\s*عليكم|وعليكم\s*السلام|مرحبا|أهلا|اهلاً|هلا|هاي|hello|hi|صباح\s*الخير|مساء\s*الخير|تمام|شكرا|شكرًا|شكراً)\b/i.test(
        normalizedMsg
      ) && !/(مادة|المادة|نظام|لائحة|عقد|دعوى|محكمة|استئناف|تنفيذ|فسخ|تعويض|عمل|عمال|موظف|إنهاء|استقالة|فصل|مخالفة|غرامة|بلاغ|شكوى)/.test(
        normalizedMsg
      );
      console.log("[AI] Saving user message to database...");
      await createAiChatMessage({
        userId: ctx.user.id,
        sessionId,
        caseId: input.caseId ?? null,
        role: "user",
        content: input.message
      });
      console.log("[AI] User message saved successfully");
      if (isSmallTalk) {
        const assistantMessage2 = "\u0623\u0647\u0644\u0627\u064B! \u062A\u0645\u0627\u0645 \u0627\u0644\u062D\u0645\u062F\u0644\u0644\u0647.\n\n\u0642\u0644\u0651\u064A \u0633\u0624\u0627\u0644\u0643 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064A \u0628\u0627\u0644\u062A\u0641\u0635\u064A\u0644 (\u0645\u062B\u0644\u0627\u064B: \u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644\u060C \u0641\u0633\u062E \u0639\u0642\u062F\u060C \u0634\u0643\u0648\u0649\u060C \u062A\u0639\u0648\u064A\u0636\u2026) \u0648\u0623\u0646\u0627 \u0623\u0639\u0637\u064A\u0643 \u062C\u0648\u0627\u0628 \u0648\u0627\u0636\u062D \u0648\u062E\u0637\u0648\u0627\u062A \u0639\u0645\u0644\u064A\u0629.";
        await createAiChatMessage({
          userId: ctx.user.id,
          sessionId,
          caseId: input.caseId ?? null,
          role: "assistant",
          content: assistantMessage2
        });
        return {
          sessionId,
          message: assistantMessage2
        };
      }
      console.log("[AI] Getting chat history...");
      const history = await getAiChatHistory(ctx.user.id, sessionId);
      console.log("[AI] Chat history retrieved, length:", history.length);
      const messages = [
        { role: "system", content: SAUDI_LAW_SYSTEM_PROMPT }
      ];
      if (input.caseId) {
        const caseData = await getCaseByIdForUser(ctx.user.id, input.caseId);
        if (caseData) {
          messages.push({
            role: "system",
            content: `\u0633\u064A\u0627\u0642 \u0627\u0644\u0642\u0636\u064A\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629:
- \u0631\u0642\u0645 \u0627\u0644\u0642\u0636\u064A\u0629: ${caseData.caseNumber}
- \u0627\u0644\u0639\u0646\u0648\u0627\u0646: ${caseData.title}
- \u0627\u0644\u0646\u0648\u0639: ${caseData.type}
- \u0627\u0644\u0645\u062D\u0643\u0645\u0629: ${caseData.court || "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F"}
- \u0627\u0644\u0645\u0631\u062D\u0644\u0629: ${caseData.stage}
- \u0627\u0644\u062D\u0627\u0644\u0629: ${caseData.status}
- \u0627\u0644\u0648\u0635\u0641: ${caseData.description || "\u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631"}
- \u0627\u0644\u062E\u0635\u0645: ${caseData.opposingParty || "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F"}`
          });
        }
      }
      const recentHistory = history.slice(-10);
      for (const msg of recentHistory) {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
      let snippets = [];
      try {
        snippets = await retrieveLegalSnippets({ query: input.message });
        if (ENV.legalRetrievalDebug) {
          console.log("[AI] Retrieval debug", {
            snippetsLength: Array.isArray(snippets) ? snippets.length : 0,
            firstUrl: Array.isArray(snippets) && snippets[0]?.url ? String(snippets[0].url) : null
          });
        }
        if (snippets.length > 0) {
          messages.push({
            role: "system",
            content: formatSnippetsForPrompt(snippets)
          });
        }
      } catch (e) {
        console.warn("[AI] Retrieval failed", e);
      }
      const wantsVerbatimArticleText = /(نص\s*المادة|تنص\s*المادة)/.test(normalizedMsg) && /\d{1,4}/.test(normalizedMsg) && !/(شرح|فسر|وضّح|وضح|ملخص|تلخيص|تحليل)/.test(normalizedMsg);
      if (ENV.legalRetrievalDebug) {
        console.log("[AI] Verbatim detection", {
          wantsVerbatimArticleText,
          normalizedMsg
        });
      }
      if (snippets.length > 0 && wantsVerbatimArticleText) {
        const best = snippets.map((s) => ({
          s,
          score: typeof s?.score === "number" ? s.score : 0,
          hasText: typeof s?.text === "string" && s.text.trim().length > 0,
          hasUrl: typeof s?.url === "string" && s.url.trim().length > 0
        })).filter((x) => x.hasText && x.hasUrl).sort((a, b) => b.score - a.score)[0]?.s;
        if (best?.text && best?.url) {
          const assistantMessage2 = `${String(best.text).trim()}`;
          await createAiChatMessage({
            userId: ctx.user.id,
            sessionId,
            caseId: input.caseId ?? null,
            role: "assistant",
            content: assistantMessage2
          });
          return {
            sessionId,
            message: assistantMessage2
          };
        }
      }
      if (snippets.length > 0 && wantsVerbatimArticleText) {
        messages.push({
          role: "system",
          content: "\u0642\u0627\u0639\u062F\u0629 \u0625\u0644\u0632\u0627\u0645\u064A\u0629: \u0625\u0630\u0627 \u0637\u0644\u0628 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 (\u0646\u0635 \u0627\u0644\u0645\u0627\u062F\u0629 \u0631\u0642\u0645 X) \u0641\u0627\u0637\u0628\u0639 \u0646\u0635 \u0627\u0644\u0645\u0627\u062F\u0629 \u062D\u0631\u0641\u064A\u0627\u064B \u0641\u0642\u0637 \u0643\u0645\u0627 \u0648\u0631\u062F \u062F\u0627\u062E\u0644 \u0627\u0644\u0645\u0642\u062A\u0637\u0641\u0627\u062A (\u0628\u062F\u0648\u0646 \u0623\u064A \u0634\u0631\u062D \u0623\u0648 \u062A\u0641\u0635\u064A\u0644 \u0623\u0648 \u0625\u0639\u0627\u062F\u0629 \u0635\u064A\u0627\u063A\u0629). \u0644\u0627 \u062A\u0636\u0641 \u0645\u0642\u062F\u0645\u0627\u062A \u0648\u0644\u0627 \u062A\u0639\u0644\u064A\u0642\u0627\u062A."
        });
      }
      if (snippets.length === 0) {
        messages.push({
          role: "system",
          content: "\u062A\u0646\u0628\u064A\u0647: \u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0645\u0642\u062A\u0637\u0641\u0627\u062A \u0643\u0627\u0641\u064A\u0629 \u0645\u0646 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0645\u0639\u0631\u0641\u0629 \u0627\u0644\u0631\u0633\u0645\u064A\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0633\u0624\u0627\u0644. \u0642\u062F\u0651\u0645 \u0625\u062C\u0627\u0628\u0629 \u0639\u0645\u0644\u064A\u0629 \u0645\u0628\u0627\u0634\u0631\u0629 \u0628\u062F\u0648\u0646 \u062A\u0647\u0631\u0651\u0628 \u0648\u0628\u062F\u0648\u0646 \u0639\u0628\u0627\u0631\u0627\u062A \u0645\u062B\u0644 (\u0627\u0633\u062A\u0634\u0631 \u0645\u062D\u0627\u0645\u064A\u0627\u064B). \u0625\u0630\u0627 \u0643\u0627\u0646 \u0627\u0644\u0633\u0624\u0627\u0644 \u0639\u0646 (\u0645\u0627\u062F\u0629 \u0631\u0642\u0645 X): \u0642\u062F\u0651\u0645 \u0645\u0644\u062E\u0635\u0627\u064B/\u0634\u0631\u062D\u0627\u064B \u063A\u064A\u0631 \u062D\u0631\u0641\u064A \u0644\u0645\u0627 \u062A\u062A\u0646\u0627\u0648\u0644\u0647 \u0627\u0644\u0645\u0627\u062F\u0629 (\u0625\u0646 \u0623\u0645\u0643\u0646) \u0645\u0639 \u0627\u0644\u062A\u0646\u0628\u064A\u0647 \u0623\u0646\u0647 \u0645\u0644\u062E\u0635 \u063A\u064A\u0631 \u0645\u0646\u0633\u0648\u0628 \u0646\u0635\u0627\u064B \u062D\u0631\u0641\u064A\u0627\u064B. \u0625\u0630\u0627 \u062A\u0639\u0630\u0631 \u0627\u0644\u0648\u0635\u0648\u0644 \u0644\u0644\u0646\u0635 \u0628\u0633\u0628\u0628 \u0642\u064A\u0648\u062F \u062A\u0642\u0646\u064A\u0629/\u0627\u062A\u0635\u0627\u0644 \u0641\u0635\u0631\u0651\u062D \u0628\u0630\u0644\u0643 \u0628\u0648\u0636\u0648\u062D \u062B\u0645 \u0636\u0639 \u0631\u0627\u0628\u0637 BOE \u0627\u0644\u0631\u0633\u0645\u064A \u0627\u0644\u0645\u0646\u0627\u0633\u0628. \u0645\u062B\u0627\u0644 (\u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644): https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/08381293-6388-48e2-8ad2-a9a700f2aa94/1"
        });
      }
      messages.push({ role: "user", content: input.message });
      let assistantMessage;
      try {
        console.log("[AI] Calling LLM with messages:", messages.length);
        const response = await invokeLLM({ messages });
        console.log("[AI] LLM response received");
        const rawContent = response.choices[0]?.message?.content;
        assistantMessage = typeof rawContent === "string" ? rawContent : "\u0639\u0630\u0631\u0627\u064B\u060C \u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0645\u0639\u0627\u0644\u062C\u0629 \u0637\u0644\u0628\u0643.";
        console.log("[AI] Assistant message length:", assistantMessage.length);
      } catch (error) {
        console.error("[AI] LLM call failed:", error);
        assistantMessage = "\u0639\u0630\u0631\u0627\u064B\u060C \u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0645\u0639\u0627\u0644\u062C\u0629 \u0637\u0644\u0628\u0643.";
      }
      await createAiChatMessage({
        userId: ctx.user.id,
        sessionId,
        caseId: input.caseId ?? null,
        role: "assistant",
        content: assistantMessage
      });
      return {
        sessionId,
        message: assistantMessage
      };
    }),
    debugRetrieve: ownerProcedure.input(
      z2.object({
        query: z2.string().min(1),
        topK: z2.number().int().min(1).max(20).optional(),
        scanLimit: z2.number().int().min(50).max(5e3).optional()
      })
    ).query(async ({ input }) => {
      const snippets = await retrieveLegalSnippets({
        query: input.query,
        topK: input.topK ?? 8,
        scanLimit: input.scanLimit ?? 900
      });
      return {
        count: snippets.length,
        snippets: snippets.map((s) => ({
          score: s.score,
          source: s.source,
          url: s.url,
          title: s.title,
          text: s.text,
          meta: s.meta
        }))
      };
    }),
    history: protectedProcedure.input(z2.object({ sessionId: z2.string() })).query(async ({ input, ctx }) => {
      return getAiChatHistory(ctx.user.id, input.sessionId);
    }),
    sessions: protectedProcedure.query(async ({ ctx }) => {
      return getAiChatSessions(ctx.user.id);
    }),
    analyzeCase: protectedProcedure.input(z2.object({
      caseId: z2.number(),
      analysisType: z2.enum(["strengths", "weaknesses", "strategy", "precedents", "memo"])
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user && ctx.user.isActive === false) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "\u064A\u062A\u0637\u0644\u0628 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0623\u062F\u0648\u0627\u062A \u0627\u0644\u062A\u062D\u0644\u064A\u0644 \u0627\u0644\u0630\u0643\u064A\u0629 \u0627\u0634\u062A\u0631\u0627\u0643\u0627\u064B \u0633\u0646\u0648\u064A\u0627\u064B \u0641\u0639\u0627\u0644\u0627\u064B. \u064A\u0631\u062C\u0649 \u0627\u0644\u0627\u0646\u062A\u0642\u0627\u0644 \u0625\u0644\u0649 \u0635\u0641\u062D\u0629 \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0627\u062A \u0644\u062A\u062C\u062F\u064A\u062F \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643."
        });
      }
      const caseData = await getCaseByIdForUser(ctx.user.id, input.caseId);
      if (!caseData) {
        throw new Error("\u0627\u0644\u0642\u0636\u064A\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
      }
      const analysisPrompts = {
        strengths: `\u062D\u0644\u0644 \u0646\u0642\u0627\u0637 \u0627\u0644\u0642\u0648\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0642\u0636\u064A\u0629 \u0648\u062D\u062F\u062F \u0627\u0644\u0639\u0648\u0627\u0645\u0644 \u0627\u0644\u062A\u064A \u062A\u0635\u0628 \u0641\u064A \u0645\u0635\u0644\u062D\u0629 \u0645\u0648\u0643\u0644\u0646\u0627:`,
        weaknesses: `\u062D\u0644\u0644 \u0646\u0642\u0627\u0637 \u0627\u0644\u0636\u0639\u0641 \u0648\u0627\u0644\u062B\u063A\u0631\u0627\u062A \u0627\u0644\u0645\u062D\u062A\u0645\u0644\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0642\u0636\u064A\u0629 \u0648\u0643\u064A\u0641 \u064A\u0645\u0643\u0646 \u0644\u0644\u062E\u0635\u0645 \u0627\u0633\u062A\u063A\u0644\u0627\u0644\u0647\u0627:`,
        strategy: `\u0627\u0642\u062A\u0631\u062D \u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u062F\u0641\u0627\u0639 \u0634\u0627\u0645\u0644\u0629 \u0644\u0647\u0630\u0647 \u0627\u0644\u0642\u0636\u064A\u0629 \u0645\u0639 \u0627\u0644\u062E\u0637\u0648\u0627\u062A \u0627\u0644\u062A\u0641\u0635\u064A\u0644\u064A\u0629:`,
        precedents: `\u0627\u0628\u062D\u062B \u0641\u064A \u0627\u0644\u0633\u0648\u0627\u0628\u0642 \u0627\u0644\u0642\u0636\u0627\u0626\u064A\u0629 \u0627\u0644\u0645\u0634\u0627\u0628\u0647\u0629 \u0641\u064A \u0627\u0644\u0642\u0627\u0646\u0648\u0646 \u0627\u0644\u0633\u0639\u0648\u062F\u064A \u0648\u0627\u0630\u0643\u0631 \u0627\u0644\u0623\u062D\u0643\u0627\u0645 \u0630\u0627\u062A \u0627\u0644\u0635\u0644\u0629:`,
        memo: `\u0627\u0643\u062A\u0628 \u0645\u0630\u0643\u0631\u0629 \u0642\u0627\u0646\u0648\u0646\u064A\u0629 \u0627\u062D\u062A\u0631\u0627\u0641\u064A\u0629 \u0644\u0647\u0630\u0647 \u0627\u0644\u0642\u0636\u064A\u0629 \u062A\u062A\u0636\u0645\u0646 \u0627\u0644\u0648\u0642\u0627\u0626\u0639 \u0648\u0627\u0644\u0623\u0633\u0627\u0646\u064A\u062F \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064A\u0629 \u0648\u0627\u0644\u0637\u0644\u0628\u0627\u062A:`
      };
      const messages = [
        { role: "system", content: SAUDI_LAW_SYSTEM_PROMPT },
        {
          role: "system",
          content: "\u062A\u0639\u0644\u064A\u0645\u0627\u062A \u0625\u0644\u0632\u0627\u0645\u064A\u0629: \u0644\u0627 \u062A\u0630\u0643\u0631 \u0633\u0648\u0627\u0628\u0642/\u0623\u062D\u0643\u0627\u0645 \u0645\u062D\u062F\u062F\u0629 \u0648\u0644\u0627 \u0623\u0631\u0642\u0627\u0645 \u0645\u0648\u0627\u062F \u0625\u0644\u0627 \u0625\u0630\u0627 \u0643\u0627\u0646\u062A \u0636\u0645\u0646 \u0645\u0642\u062A\u0637\u0641\u0627\u062A \u0631\u0633\u0645\u064A\u0629 \u0645\u0642\u062F\u0645\u0629 \u0644\u0643 \u0641\u064A \u0627\u0644\u0633\u064A\u0627\u0642. \u0625\u0646 \u0644\u0645 \u062A\u062A\u0648\u0641\u0631 \u0645\u0642\u062A\u0637\u0641\u0627\u062A\u060C \u0642\u062F\u0651\u0645 \u0625\u0637\u0627\u0631 \u0639\u0645\u0644 \u0648\u062A\u062D\u0644\u064A\u0644 \u0645\u0646\u0637\u0642\u064A \u0648\u062E\u0637\u0648\u0627\u062A \u0639\u0645\u0644\u064A\u0629 \u0648\u0627\u0630\u0643\u0631 \u0623\u0646 \u0627\u0644\u0627\u0633\u062A\u0646\u0627\u062F \u0627\u0644\u0646\u0635\u064A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u062D\u0627\u0644\u064A\u0627\u064B."
        },
        {
          role: "user",
          content: `${analysisPrompts[input.analysisType]}

\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0642\u0636\u064A\u0629:
- \u0631\u0642\u0645 \u0627\u0644\u0642\u0636\u064A\u0629: ${caseData.caseNumber}
- \u0627\u0644\u0639\u0646\u0648\u0627\u0646: ${caseData.title}
- \u0627\u0644\u0646\u0648\u0639: ${caseData.type}
- \u0627\u0644\u0645\u062D\u0643\u0645\u0629: ${caseData.court || "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F"}
- \u0627\u0644\u0645\u0631\u062D\u0644\u0629: ${caseData.stage}
- \u0627\u0644\u0648\u0635\u0641: ${caseData.description || "\u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631"}
- \u0627\u0644\u062E\u0635\u0645: ${caseData.opposingParty || "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F"}
- \u0645\u062D\u0627\u0645\u064A \u0627\u0644\u062E\u0635\u0645: ${caseData.opposingLawyer || "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F"}
- \u0645\u0644\u0627\u062D\u0638\u0627\u062A: ${caseData.notes || "\u0644\u0627 \u062A\u0648\u062C\u062F"}`
        }
      ];
      try {
        const query = `${analysisPrompts[input.analysisType]} ${caseData.title} ${caseData.type} ${caseData.court ?? ""}`;
        const snippets = await retrieveLegalSnippets({ query, topK: 6, scanLimit: 900 });
        if (snippets.length > 0) {
          messages.splice(1, 0, {
            role: "system",
            content: formatSnippetsForPrompt(snippets)
          });
        }
      } catch (e) {
        console.warn("[AI] Retrieval failed (analyzeCase)", e);
      }
      const response = await invokeLLM({ messages });
      const rawAnalysis = response.choices[0]?.message?.content;
      const analysis = typeof rawAnalysis === "string" ? rawAnalysis : "\u0639\u0630\u0631\u0627\u064B\u060C \u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062A\u062D\u0644\u064A\u0644.";
      return { analysis };
    }),
    generateDocument: protectedProcedure.input(z2.object({
      documentType: z2.enum(["memo", "pleading", "contract", "power_of_attorney", "letter"]),
      caseId: z2.number().optional().nullable(),
      clientId: z2.number().optional().nullable(),
      customInstructions: z2.string().optional()
    })).mutation(async ({ input, ctx }) => {
      const documentPrompts = {
        memo: "\u0627\u0643\u062A\u0628 \u0645\u0630\u0643\u0631\u0629 \u0642\u0627\u0646\u0648\u0646\u064A\u0629 \u0627\u062D\u062A\u0631\u0627\u0641\u064A\u0629",
        pleading: "\u0627\u0643\u062A\u0628 \u0644\u0627\u0626\u062D\u0629 \u062F\u0639\u0648\u0649/\u062C\u0648\u0627\u0628\u064A\u0629",
        contract: "\u0627\u0643\u062A\u0628 \u0639\u0642\u062F \u0642\u0627\u0646\u0648\u0646\u064A",
        power_of_attorney: "\u0627\u0643\u062A\u0628 \u0648\u0643\u0627\u0644\u0629 \u0642\u0627\u0646\u0648\u0646\u064A\u0629",
        letter: "\u0627\u0643\u062A\u0628 \u062E\u0637\u0627\u0628 \u0631\u0633\u0645\u064A \u0642\u0627\u0646\u0648\u0646\u064A"
      };
      let context = "";
      if (input.caseId) {
        const caseData = await getCaseByIdForUser(ctx.user.id, input.caseId);
        if (!caseData) {
          throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u0642\u0636\u064A\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629" });
        }
        context = `

\u0633\u064A\u0627\u0642 \u0627\u0644\u0642\u0636\u064A\u0629:
- \u0631\u0642\u0645 \u0627\u0644\u0642\u0636\u064A\u0629: ${caseData.caseNumber}
- \u0627\u0644\u0639\u0646\u0648\u0627\u0646: ${caseData.title}
- \u0627\u0644\u0646\u0648\u0639: ${caseData.type}`;
      }
      if (input.clientId) {
        const client = await getClientByIdForUser(ctx.user.id, input.clientId);
        if (!client) {
          throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u0639\u0645\u064A\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
        }
        context += `

\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0639\u0645\u064A\u0644:
- \u0627\u0644\u0627\u0633\u0645: ${client.name}
- \u0627\u0644\u0646\u0648\u0639: ${client.type}`;
      }
      const messages = [
        { role: "system", content: SAUDI_LAW_SYSTEM_PROMPT },
        {
          role: "user",
          content: `${documentPrompts[input.documentType]}${context}${input.customInstructions ? `

\u062A\u0639\u0644\u064A\u0645\u0627\u062A \u0625\u0636\u0627\u0641\u064A\u0629: ${input.customInstructions}` : ""}`
        }
      ];
      const response = await invokeLLM({ messages });
      const rawDocument = response.choices[0]?.message?.content;
      const document = typeof rawDocument === "string" ? rawDocument : "\u0639\u0630\u0631\u0627\u064B\u060C \u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0645\u0633\u062A\u0646\u062F.";
      return { document };
    })
  }),
  legalKnowledge: router({
    runCrawl: adminProcedure.input(
      z2.object({
        seedSitemaps: z2.array(z2.string().url()).optional(),
        force: z2.boolean().optional()
      }).optional()
    ).mutation(async ({ input }) => {
      const result = await runLegalCrawlerOnce({
        seedSitemaps: input?.seedSitemaps,
        force: input?.force ?? true
      });
      return result;
    }),
    search: adminProcedure.input(
      z2.object({
        query: z2.string().min(1),
        topK: z2.number().int().min(1).max(10).default(5)
      })
    ).query(async ({ input }) => {
      return retrieveLegalSnippets({ query: input.query, topK: input.topK, scanLimit: 1e3 });
    })
  }),
  // ==================== NOTIFICATIONS ====================
  notifications: router({
    list: protectedProcedure.input(z2.object({ unreadOnly: z2.boolean().optional() }).optional()).query(async ({ input, ctx }) => {
      return getNotificationsByUserId(ctx.user.id, input?.unreadOnly);
    }),
    markAsRead: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ input, ctx }) => {
      await markNotificationAsReadForUser(ctx.user.id, input.id);
      return { success: true };
    }),
    markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
      await markAllNotificationsAsRead(ctx.user.id);
      return { success: true };
    })
  }),
  // ==================== USERS/TEAM ====================
  team: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      return getUsersByOrganizationId(organizationId);
    }),
    addMember: protectedProcedure.input(
      z2.object({
        name: z2.string().min(1),
        email: z2.string().email().optional().nullable(),
        phone: z2.string().optional().nullable(),
        role: z2.enum(["lawyer", "assistant", "client"]).default("lawyer")
      })
    ).mutation(async ({ ctx, input }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      const org = await getOrganizationById(organizationId);
      const orgPlan = org?.subscriptionPlan ?? "individual";
      const seatLimit = org?.seatLimit ?? 1;
      const memberCount = await getOrganizationMemberCount(organizationId);
      if (memberCount >= seatLimit) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: `\u0644\u0627 \u064A\u0645\u0643\u0646 \u0625\u0636\u0627\u0641\u0629 \u0639\u0636\u0648 \u062C\u062F\u064A\u062F. \u0644\u0642\u062F \u0648\u0635\u0644\u062A \u0644\u0644\u062D\u062F \u0627\u0644\u0623\u0642\u0635\u0649 \u0644\u0645\u0642\u0627\u0639\u062F \u0627\u0644\u0628\u0627\u0642\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 (${seatLimit}).`
        });
      }
      const normalizedEmail = typeof input.email === "string" ? input.email.trim().toLowerCase() : void 0;
      const openId = `org-${organizationId}-${nanoid(12)}`;
      try {
        await upsertUser({
          openId,
          organizationId,
          name: input.name,
          email: normalizedEmail ?? null,
          phone: input.phone ?? null,
          loginMethod: "org",
          role: input.role,
          accountType: orgPlan,
          subscriptionPlan: orgPlan,
          seatLimit,
          isActive: ctx.user.isActive,
          lastSignedIn: /* @__PURE__ */ new Date()
        });
      } catch (error) {
        const errMsg = error?.message ?? "";
        if (errMsg === "EMAIL_ALREADY_IN_USE") {
          throw new TRPCError3({
            code: "CONFLICT",
            message: "\u0647\u0630\u0627 \u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0627\u0644\u0641\u0639\u0644."
          });
        }
        if (errMsg === "PHONE_ALREADY_IN_USE") {
          throw new TRPCError3({
            code: "CONFLICT",
            message: "\u0647\u0630\u0627 \u0631\u0642\u0645 \u0627\u0644\u062C\u0648\u0627\u0644 \u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0627\u0644\u0641\u0639\u0644."
          });
        }
        throw error;
      }
      return { success: true };
    }),
    lawyers: protectedProcedure.query(async ({ ctx }) => {
      const organizationId = await ensureUserHasOrganization({
        openId: ctx.user.openId,
        defaultOrganizationName: ctx.user.name ?? null
      });
      const members = await getUsersByOrganizationId(organizationId);
      return members.filter((u) => u.role === "lawyer" || u.role === "admin");
    })
  }),
  // ==================== COMMUNICATION LOGS ====================
  communications: router({
    create: protectedProcedure.input(z2.object({
      clientId: z2.number(),
      caseId: z2.number().optional().nullable(),
      type: z2.enum(["call", "email", "meeting", "whatsapp", "sms", "other"]),
      direction: z2.enum(["incoming", "outgoing"]),
      subject: z2.string().optional().nullable(),
      content: z2.string().optional().nullable()
    })).mutation(async ({ input, ctx }) => {
      const ownedClient = await getClientByIdForUser(ctx.user.id, input.clientId);
      if (!ownedClient) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u0639\u0645\u064A\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
      }
      if (input.caseId) {
        const ownedCase = await getCaseByIdForUser(ctx.user.id, input.caseId);
        if (!ownedCase) {
          throw new TRPCError3({ code: "NOT_FOUND", message: "\u0627\u0644\u0642\u0636\u064A\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629" });
        }
      }
      const id = await createCommunicationLog({
        ...input,
        userId: ctx.user.id
      });
      return { id };
    })
  }),
  // ==================== TIME ENTRIES ====================
  timeEntries: router({
    create: protectedProcedure.input(z2.object({
      caseId: z2.number(),
      description: z2.string().optional().nullable(),
      minutes: z2.number(),
      hourlyRate: z2.number().optional().nullable(),
      billable: z2.boolean().optional()
    })).mutation(async ({ input, ctx }) => {
      const ownedCase = await getCaseByIdForUser(ctx.user.id, input.caseId);
      if (!ownedCase) {
        throw new TRPCError3({ code: "FORBIDDEN", message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" });
      }
      const id = await createTimeEntry({
        ...input,
        userId: ctx.user.id
      });
      return { id };
    }),
    byCaseId: protectedProcedure.input(z2.object({ caseId: z2.number() })).query(async ({ input, ctx }) => {
      return getTimeEntriesByCaseIdForUser(ctx.user.id, input.caseId);
    }),
    myEntries: protectedProcedure.query(async ({ ctx }) => {
      return getTimeEntriesByUserId(ctx.user.id);
    })
  }),
  owner: router({
    overview: ownerProcedure.query(async () => {
      const [users2, organizations2] = await Promise.all([getAllUsers(), getAllOrganizations()]);
      const totalUsers = users2.length;
      const activeUsers = users2.filter((u) => u.isActive).length;
      const totalOrganizations = organizations2.length;
      const byPlan = {
        individual: 0,
        law_firm: 0,
        enterprise: 0
      };
      for (const u of users2) {
        const plan = u.subscriptionPlan ?? "individual";
        byPlan[plan] = (byPlan[plan] ?? 0) + 1;
      }
      return {
        totalUsers,
        activeUsers,
        totalOrganizations,
        usersByPlan: byPlan
      };
    }),
    promoCode: router({
      get: ownerProcedure.query(async () => {
        const value = await getAppSetting("promoCode");
        return { promoCode: typeof value === "string" ? value : null };
      }),
      set: ownerProcedure.input(z2.object({ promoCode: z2.string().max(64).optional().nullable() })).mutation(async ({ input }) => {
        const next = typeof input.promoCode === "string" ? input.promoCode.trim().toUpperCase() : "";
        await setAppSetting({
          key: "promoCode",
          value: next ? next : null
        });
        return { success: true, promoCode: next ? next : null };
      })
    }),
    stats: ownerProcedure.input(
      z2.object({
        range: z2.enum(["week", "month", "quarter", "year"]).optional()
      }).optional()
    ).query(async ({ input }) => {
      const [users2, organizations2, caseStats, invoiceStats, reportsStats, dashboardStats] = await Promise.all([
        getAllUsers(),
        getAllOrganizations(),
        getCaseStats(),
        getInvoiceStats(),
        getReportsStats(input?.range),
        getDashboardStats()
      ]);
      const totalUsers = users2.length;
      const activeUsers = users2.filter((u) => u.isActive).length;
      const totalOrganizations = organizations2.length;
      return {
        users: {
          total: totalUsers,
          active: activeUsers
        },
        organizations: {
          total: totalOrganizations
        },
        cases: caseStats,
        invoices: invoiceStats,
        reports: reportsStats,
        dashboard: dashboardStats
      };
    }),
    users: router({
      list: ownerProcedure.input(
        z2.object({
          query: z2.string().optional(),
          role: z2.enum(["admin", "lawyer", "assistant", "client"]).optional(),
          isActive: z2.boolean().optional()
        }).optional()
      ).query(async ({ input }) => {
        const [users2, organizations2] = await Promise.all([getAllUsers(), getAllOrganizations()]);
        const orgById = new Map(organizations2.map((o) => [Number(o.id), o]));
        const q = (input?.query ?? "").trim().toLowerCase();
        let list = users2;
        if (input?.role) {
          list = list.filter((u) => u.role === input.role);
        }
        if (typeof input?.isActive === "boolean") {
          list = list.filter((u) => Boolean(u.isActive) === input.isActive);
        }
        if (q) {
          list = list.filter((u) => {
            const name = (u.name ?? "").toLowerCase();
            const email = (u.email ?? "").toLowerCase();
            const phone = (u.phone ?? "").toLowerCase();
            const openId = (u.openId ?? "").toLowerCase();
            return name.includes(q) || email.includes(q) || phone.includes(q) || openId.includes(q);
          });
        }
        return list.map((u) => {
          const orgId = u.organizationId ? Number(u.organizationId) : null;
          const org = orgId ? orgById.get(orgId) : null;
          return {
            ...u,
            organization: org ? { id: Number(org.id), name: org.name, subscriptionPlan: org.subscriptionPlan, seatLimit: org.seatLimit } : null
          };
        });
      }),
      setActive: ownerProcedure.input(z2.object({ userId: z2.number(), isActive: z2.boolean() })).mutation(async ({ input }) => {
        await setUserActive(input.userId, input.isActive);
        return { success: true };
      }),
      setPlan: ownerProcedure.input(
        z2.object({
          userId: z2.number(),
          plan: z2.enum(["individual", "law_firm", "enterprise"]),
          isActive: z2.boolean().optional()
        })
      ).mutation(async ({ input }) => {
        const user = await getUserById(input.userId);
        if (!user) {
          throw new TRPCError3({ code: "NOT_FOUND", message: "User not found" });
        }
        const seatLimit = input.plan === "law_firm" ? 5 : input.plan === "enterprise" ? 15 : 1;
        const organizationId = await ensureUserHasOrganization({
          openId: user.openId,
          defaultOrganizationName: user.name ?? null
        });
        await setOrganizationSubscriptionPlan({
          organizationId,
          subscriptionPlan: input.plan,
          seatLimit
        });
        await setUserSubscriptionPlan({
          userId: user.id,
          subscriptionPlan: input.plan,
          accountType: input.plan,
          seatLimit
        });
        if (typeof input.isActive === "boolean") {
          await setUserActive(user.id, input.isActive);
        }
        return { success: true };
      })
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  console.log("[Context] Creating context for path:", opts.req.path);
  let user = null;
  const authHeader = opts.req.headers.authorization;
  const hasBearer = typeof authHeader === "string" && authHeader.startsWith("Bearer ");
  const cookieHeader = opts.req.headers.cookie;
  const hasSessionCookie = typeof cookieHeader === "string" && cookieHeader.includes(`${COOKIE_NAME}=`);
  if (!hasBearer && !hasSessionCookie) {
    console.log("[Context] Context created with user:", false);
    return {
      req: opts.req,
      res: opts.res,
      user: null
    };
  }
  try {
    console.log("[Context] Authenticating request...");
    user = await sdk.authenticateRequest(opts.req);
    console.log("[Context] Authentication successful, user ID:", user?.id);
  } catch (error) {
    console.log(
      "[Context] Authentication failed:",
      error instanceof Error ? error.message : String(error)
    );
    user = null;
  }
  console.log("[Context] Context created with user:", !!user);
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/firebaseWebConfig.ts
var firebaseWebConfig = {
  apiKey: "AIzaSyDZkfzWCQSg4XFbwCQv29HvDI4vIxBw7lA",
  authDomain: "mawzenco.firebaseapp.com",
  projectId: "mawazen-7291a",
  storageBucket: "mawzenco.firebasestorage.app",
  messagingSenderId: "888669754968",
  appId: "1:888669754968:web:e650b811ae28fc51e7dc2d",
  measurementId: "G-JHD98XMBN2"
};

// server/storage.ts
function getStorageConfig() {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}
function buildUploadUrl(baseUrl, relKey) {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}
function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function toFormData(data, contentType, fileName) {
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}
function buildAuthHeaders(apiKey) {
  return { Authorization: `Bearer ${apiKey}` };
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

// server/documentReminders.ts
import { and as and2, lte as lte2, or as or2, sql as sql2 } from "drizzle-orm";
var DAY_MS = 24 * 60 * 60 * 1e3;
async function runDocumentRemindersOnce() {
  if (!ENV.documentRemindersEnabled) {
    return { skipped: true, reason: "DOCUMENT_REMINDERS_ENABLED is not true" };
  }
  const database = await getDb();
  if (!database) {
    return { skipped: true, reason: "Database not available" };
  }
  const now = /* @__PURE__ */ new Date();
  const scanFuture = new Date(now.getTime() + 365 * DAY_MS);
  const rows = await database.select().from(documents).where(
    or2(
      and2(sql2`${documents.renewAt} IS NOT NULL`, lte2(documents.renewAt, scanFuture)),
      and2(sql2`${documents.expiresAt} IS NOT NULL`, lte2(documents.expiresAt, scanFuture))
    )
  );
  let sent = 0;
  for (const doc of rows) {
    const dueAt = doc.renewAt ?? doc.expiresAt ? new Date(doc.renewAt ?? doc.expiresAt) : null;
    if (!dueAt) continue;
    const reminderDays = Number(doc.reminderDays ?? 30);
    const lastSent = doc.lastReminderSentAt ? new Date(doc.lastReminderSentAt) : null;
    if (lastSent && now.getTime() - lastSent.getTime() < DAY_MS) continue;
    const diffMs = dueAt.getTime() - now.getTime();
    const withinWindow = diffMs <= reminderDays * DAY_MS;
    if (!withinWindow && diffMs > 0) continue;
    const userId = doc.uploadedById;
    if (!userId) continue;
    const isRenew = Boolean(doc.renewAt);
    const dueLabel = isRenew ? "\u062A\u062C\u062F\u064A\u062F" : "\u0627\u0646\u062A\u0647\u0627\u0621";
    const dueDateStr = dueAt.toLocaleDateString("ar-SA");
    await createNotification({
      userId,
      title: "\u062A\u0646\u0628\u064A\u0647 \u0645\u0633\u062A\u0646\u062F",
      message: `\u0627\u0644\u0645\u0633\u062A\u0646\u062F "${doc.name}" \u0627\u0642\u062A\u0631\u0628 \u0645\u0648\u0639\u062F ${dueLabel}\u0647 \u0628\u062A\u0627\u0631\u064A\u062E ${dueDateStr}.`,
      type: "system",
      isRead: false,
      relatedCaseId: doc.caseId ?? null,
      relatedInvoiceId: null,
      createdAt: now
    });
    await updateDocument(doc.id, { lastReminderSentAt: now });
    sent++;
  }
  return { skipped: false, scanned: rows.length, sent };
}
function startDocumentRemindersScheduler() {
  if (!ENV.documentRemindersEnabled) {
    return { started: false, reason: "DOCUMENT_REMINDERS_ENABLED is not true" };
  }
  const intervalMinutes = ENV.documentRemindersIntervalMinutes;
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    return { started: false, reason: "DOCUMENT_REMINDERS_INTERVAL_MINUTES is invalid" };
  }
  const run = async () => {
    try {
      const res = await runDocumentRemindersOnce();
      if (!res.skipped) {
        console.log(`[DocumentReminders] scanned=${res.scanned} sent=${res.sent}`);
      } else {
        console.log(`[DocumentReminders] skipped: ${res.reason}`);
      }
    } catch (e) {
      console.warn("[DocumentReminders] run failed", e);
    }
  };
  void run();
  const timer = setInterval(run, intervalMinutes * 60 * 1e3);
  timer.unref?.();
  return { started: true, intervalMinutes };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid as nanoid2 } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
function copyClientLogoPlugin() {
  const src = path.resolve(import.meta.dirname, "logo.png");
  const destDir = path.resolve(import.meta.dirname, "client", "public");
  const dest = path.resolve(destDir, "logo.png");
  const copy = () => {
    try {
      if (!fs.existsSync(src)) return;
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(src, dest);
    } catch {
    }
  };
  return {
    name: "copy-client-logo",
    buildStart() {
      copy();
    },
    configureServer() {
      copy();
    }
  };
}
var plugins = [react(), tailwindcss(), vitePluginManusRuntime(), copyClientLogoPlugin()];
var vite_config_default = defineConfig({
  base: "/",
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "client/dist"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid2()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  if (process.env.NODE_ENV === "production") {
    console.log("[Static] Production mode - serving API only, frontend handled by Netlify");
    return;
  }
  const distPath = path2.resolve(import.meta.dirname, "../..", "client", "dist");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  } else {
    console.log(`[Static] Serving static files from: ${distPath}`);
    app.use(express.static(distPath));
  }
  app.use("*", (_req, res) => {
    const indexPath = path2.resolve(distPath, "index.html");
    if (fs2.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: "Frontend not built" });
    }
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  const OWNER_DASHBOARD_COOKIE = "owner_dashboard_session";
  const ownerDashboardSecretKey = new TextEncoder().encode(ENV.cookieSecret);
  const signOwnerDashboardSession = async () => {
    const expiresInDays = 30;
    const expirationSeconds = Math.floor((Date.now() + expiresInDays * 24 * 60 * 60 * 1e3) / 1e3);
    return new SignJWT2({ t: "owner_dashboard" }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(ownerDashboardSecretKey);
  };
  const verifyOwnerDashboardSession = async (cookieValue) => {
    if (!cookieValue) return false;
    try {
      const { payload } = await jwtVerify2(cookieValue, ownerDashboardSecretKey, {
        algorithms: ["HS256"]
      });
      return payload?.t === "owner_dashboard";
    } catch {
      return false;
    }
  };
  const getCookieValue = (req, name) => {
    const header = req.headers.cookie;
    if (!header) return null;
    try {
      const parsed = parseCookieHeader2(header);
      const v = parsed?.[name];
      return typeof v === "string" && v.trim() ? v : null;
    } catch {
      return null;
    }
  };
  const requireOwnerDashboard = async (req, res) => {
    if (!ENV.ownerOpenId || !ENV.ownerOpenId.trim()) {
      res.status(403).json({ success: false, message: "Owner is not configured" });
      return false;
    }
    const token = getCookieValue(req, OWNER_DASHBOARD_COOKIE);
    const ok = await verifyOwnerDashboardSession(token);
    if (!ok) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return false;
    }
    return true;
  };
  const ownerPublicDir = path3.join(process.cwd(), "public", "owner");
  try {
    await fs3.access(ownerPublicDir);
    app.get("/owner", (_req, res) => {
      res.redirect("/owner/index.html");
    });
    app.use("/owner", express2.static(ownerPublicDir));
  } catch {
  }
  app.post("/api/owner/login", async (req, res) => {
    try {
      const configuredPassword = (process.env.OWNER_DASHBOARD_PASSWORD ?? "").trim();
      if (!configuredPassword) {
        return res.status(403).json({ success: false, message: "Owner dashboard password is not configured" });
      }
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!password || password !== configuredPassword) {
        return res.status(401).json({ success: false, message: "Invalid password" });
      }
      const token = await signOwnerDashboardSession();
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(OWNER_DASHBOARD_COOKIE, token, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60 * 1e3
      });
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, message: "Login failed" });
    }
  });
  app.get("/api/owner/status", async (req, res) => {
    const isOwner = await verifyOwnerDashboardSession(getCookieValue(req, OWNER_DASHBOARD_COOKIE));
    return res.json({ isOwner });
  });
  app.post("/api/owner/logout", async (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(OWNER_DASHBOARD_COOKIE, { ...cookieOptions, maxAge: -1 });
    return res.json({ success: true });
  });
  app.get("/api/owner/overview", async (req, res) => {
    if (!await requireOwnerDashboard(req, res)) return;
    const [users2, organizations2] = await Promise.all([getAllUsers(), getAllOrganizations()]);
    const totalUsers = users2.length;
    const activeUsers = users2.filter((u) => u.isActive).length;
    const totalOrganizations = organizations2.length;
    const byPlan = {
      individual: 0,
      law_firm: 0,
      enterprise: 0
    };
    for (const u of users2) {
      const plan = u.subscriptionPlan ?? "individual";
      byPlan[plan] = (byPlan[plan] ?? 0) + 1;
    }
    return res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        totalOrganizations,
        usersByPlan: byPlan
      }
    });
  });
  app.get("/api/owner/stats", async (req, res) => {
    if (!await requireOwnerDashboard(req, res)) return;
    const rangeRaw = typeof req.query?.range === "string" ? req.query.range : "";
    const range = ["week", "month", "quarter", "year"].includes(rangeRaw) ? rangeRaw : void 0;
    const [users2, organizations2, caseStats, invoiceStats, reportsStats, dashboardStats] = await Promise.all([
      getAllUsers(),
      getAllOrganizations(),
      getCaseStats(),
      getInvoiceStats(),
      getReportsStats(range),
      getDashboardStats()
    ]);
    return res.json({
      success: true,
      data: {
        users: {
          total: users2.length,
          active: users2.filter((u) => u.isActive).length
        },
        organizations: {
          total: organizations2.length
        },
        cases: caseStats,
        invoices: invoiceStats,
        reports: reportsStats,
        dashboard: dashboardStats
      }
    });
  });
  app.get("/api/owner/users", async (req, res) => {
    if (!await requireOwnerDashboard(req, res)) return;
    const [users2, organizations2] = await Promise.all([getAllUsers(), getAllOrganizations()]);
    const orgById = new Map(organizations2.map((o) => [Number(o.id), o]));
    const query = typeof req.query?.query === "string" ? req.query.query.trim().toLowerCase() : "";
    const role = typeof req.query?.role === "string" ? req.query.role : "";
    const isActiveRaw = typeof req.query?.isActive === "string" ? req.query.isActive : "";
    const isActive = isActiveRaw === "true" ? true : isActiveRaw === "false" ? false : null;
    let list = users2;
    if (role && ["admin", "lawyer", "assistant", "client"].includes(role)) {
      list = list.filter((u) => u.role === role);
    }
    if (typeof isActive === "boolean") {
      list = list.filter((u) => Boolean(u.isActive) === isActive);
    }
    if (query) {
      list = list.filter((u) => {
        const name = String(u.name ?? "").toLowerCase();
        const email = String(u.email ?? "").toLowerCase();
        const phone = String(u.phone ?? "").toLowerCase();
        const openId = String(u.openId ?? "").toLowerCase();
        return name.includes(query) || email.includes(query) || phone.includes(query) || openId.includes(query);
      });
    }
    const data = list.map((u) => {
      const orgId = u.organizationId ? Number(u.organizationId) : null;
      const org = orgId ? orgById.get(orgId) : null;
      return {
        ...u,
        organization: org ? { id: Number(org.id), name: org.name, subscriptionPlan: org.subscriptionPlan, seatLimit: org.seatLimit } : null
      };
    });
    return res.json({ success: true, data });
  });
  app.post("/api/owner/users/:userId/active", async (req, res) => {
    if (!await requireOwnerDashboard(req, res)) return;
    const userId = Number(req.params.userId);
    const isActive = Boolean(req.body?.isActive);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid userId" });
    }
    await setUserActive(userId, isActive);
    return res.json({ success: true });
  });
  app.post("/api/owner/users/:userId/plan", async (req, res) => {
    if (!await requireOwnerDashboard(req, res)) return;
    const userId = Number(req.params.userId);
    const plan = typeof req.body?.plan === "string" ? req.body.plan : "";
    const isActive = typeof req.body?.isActive === "boolean" ? req.body.isActive : void 0;
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid userId" });
    }
    if (!plan || !["individual", "law_firm", "enterprise"].includes(plan)) {
      return res.status(400).json({ success: false, message: "Invalid plan" });
    }
    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const seatLimit = plan === "law_firm" ? 5 : plan === "enterprise" ? 15 : 1;
    const organizationId = await ensureUserHasOrganization({
      openId: user.openId,
      defaultOrganizationName: user.name ?? null
    });
    await setOrganizationSubscriptionPlan({
      organizationId,
      subscriptionPlan: plan,
      seatLimit
    });
    await setUserSubscriptionPlan({
      userId: user.id,
      subscriptionPlan: plan,
      accountType: plan,
      seatLimit
    });
    if (typeof isActive === "boolean") {
      await setUserActive(user.id, isActive);
    }
    return res.json({ success: true });
  });
  const uploadsDir = path3.join(process.cwd(), "uploads");
  await fs3.mkdir(uploadsDir, { recursive: true });
  app.use("/uploads", express2.static(uploadsDir));
  const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : [];
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (allowedOrigins.includes(origin) || origin.includes("localhost") || origin.endsWith(".up.railway.app") || origin.endsWith(".railway.internal"))) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With"
      );
      if (req.method === "OPTIONS") {
        return res.sendStatus(204);
      }
    }
    next();
  });
  app.get("/api/public/firebase-config", (req, res) => {
    try {
      const forwardedHostHeader = req.headers["x-forwarded-host"];
      const forwardedHost = Array.isArray(forwardedHostHeader) ? forwardedHostHeader[0] : forwardedHostHeader;
      const host = typeof forwardedHost === "string" && forwardedHost.trim() ? forwardedHost.trim().split(",")[0].trim().toLowerCase() : typeof req.hostname === "string" ? req.hostname.toLowerCase() : "";
      const shouldUseCustomAuthDomain = host === "mawazenco.com" || host === "www.mawazenco.com" || host.endsWith(".mawazenco.com");
      res.json({
        ...firebaseWebConfig,
        authDomain: shouldUseCustomAuthDomain ? "auth.mawazenco.com" : firebaseWebConfig.authDomain
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to load Firebase config" });
    }
  });
  app.post("/api/auth/firebase", async (req, res) => {
    try {
      const idToken = typeof req.body?.idToken === "string" ? req.body.idToken : "";
      if (!idToken) {
        return res.status(400).json({ success: false, message: "Missing idToken" });
      }
      const profileName = typeof req.body?.profile?.name === "string" ? req.body.profile.name.trim() : "";
      const profilePhone = typeof req.body?.profile?.phone === "string" ? req.body.profile.phone.trim() : "";
      const profileOrganizationName = typeof req.body?.profile?.organizationName === "string" ? req.body.profile.organizationName.trim() : "";
      const admin = getFirebaseAdmin();
      const decoded = await admin.auth().verifyIdToken(idToken);
      const uid = decoded.uid;
      const signInProvider = decoded?.firebase?.sign_in_provider;
      const loginMethod = signInProvider === "google.com" ? "google" : signInProvider === "password" ? "email" : signInProvider === "phone" ? "phone" : "firebase";
      const name = typeof decoded?.name === "string" && decoded.name.trim() ? decoded.name.trim() : profileName;
      const email = typeof decoded.email === "string" ? decoded.email.trim().toLowerCase() : null;
      const emailVerified = decoded?.email_verified === true;
      const linkedPhone = typeof decoded?.phone_number === "string" && decoded.phone_number.trim() ? decoded.phone_number.trim() : null;
      const phone = linkedPhone || profilePhone || null;
      const openId = `firebase-${uid}`;
      const signedInAt = /* @__PURE__ */ new Date();
      await upsertUser({
        openId,
        name: name || null,
        email,
        phone,
        loginMethod,
        lastSignedIn: signedInAt,
        isActive: true
      });
      await ensureUserHasOrganization({
        openId,
        defaultOrganizationName: profileOrganizationName || name || null
      });
      const user = await getUserByOpenId(openId);
      if (!user) {
        return res.status(500).json({ success: false, message: "Failed to create user" });
      }
      if (signInProvider === "password" && email && !emailVerified && !linkedPhone) {
        return res.status(403).json({
          success: false,
          code: "EMAIL_NOT_VERIFIED",
          message: "\u064A\u062C\u0628 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062D\u0633\u0627\u0628 \u0623\u0648\u0644\u0627\u064B \u0639\u0628\u0631 \u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0623\u0648 \u0631\u0642\u0645 \u0627\u0644\u062C\u0648\u0627\u0644."
        });
      }
      const token = await sdk.createSessionToken(openId, {
        name: user.name || name || ""
      });
      return res.json({
        success: true,
        data: {
          token,
          user
        }
      });
    } catch (error) {
      console.error("[Auth] Firebase login failed", error);
      const errMessage = error instanceof Error ? error.message : "";
      if (errMessage === "PHONE_ALREADY_IN_USE") {
        return res.status(409).json({
          success: false,
          code: "PHONE_ALREADY_IN_USE",
          message: "\u0647\u0630\u0627 \u0631\u0642\u0645 \u0627\u0644\u062C\u0648\u0627\u0644 \u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0627\u0644\u0641\u0639\u0644. \u0627\u0633\u062A\u062E\u062F\u0645 \u0631\u0642\u0645\u064B\u0627 \u0622\u062E\u0631 \u0623\u0648 \u0633\u062C\u0651\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0628\u0627\u0644\u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0631\u062A\u0628\u0637 \u0628\u0647."
        });
      }
      if (errMessage === "EMAIL_ALREADY_IN_USE") {
        return res.status(409).json({
          success: false,
          code: "EMAIL_ALREADY_IN_USE",
          message: "\u0647\u0630\u0627 \u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0627\u0644\u0641\u0639\u0644. \u0633\u062C\u0651\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0628\u062F\u0644 \u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628 \u062C\u062F\u064A\u062F."
        });
      }
      return res.status(401).json({
        success: false,
        message: "Firebase authentication failed"
      });
    }
  });
  app.post("/api/documents/upload", async (req, res) => {
    try {
      await sdk.authenticateRequest(req);
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const filename = typeof req.body?.filename === "string" ? req.body.filename : "file";
      const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : null;
      const dataBase64 = typeof req.body?.dataBase64 === "string" ? req.body.dataBase64 : "";
      if (!dataBase64) {
        return res.status(400).json({ error: "Missing file data" });
      }
      const buffer = Buffer.from(dataBase64, "base64");
      const maxSize = 10 * 1024 * 1024;
      if (buffer.length > maxSize) {
        return res.status(400).json({ error: "File too large" });
      }
      const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storedName = `${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName}`;
      try {
        const contentType = mimeType ?? "application/octet-stream";
        const { key, url } = await storagePut(`uploads/${storedName}`, buffer, contentType);
        return res.json({
          fileUrl: url,
          fileKey: key,
          mimeType,
          fileSize: buffer.length
        });
      } catch {
        const filePath = path3.join(uploadsDir, storedName);
        await fs3.writeFile(filePath, buffer);
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        return res.json({
          fileUrl: `${baseUrl}/uploads/${storedName}`,
          fileKey: storedName,
          mimeType,
          fileSize: buffer.length
        });
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Upload failed" });
    }
  });
  registerOAuthRoutes(app);
  console.log("[Server] Setting up tRPC middleware...");
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  console.log("[Server] tRPC middleware configured");
  const crawler = startLegalCrawlerScheduler();
  if (crawler.started) {
    console.log(`[LegalCrawler] Scheduler started (intervalMinutes=${crawler.intervalMinutes})`);
  } else {
    console.log(`[LegalCrawler] Scheduler not started (${crawler.reason})`);
  }
  const docReminders = startDocumentRemindersScheduler();
  if (docReminders.started) {
    console.log(`[DocumentReminders] Scheduler started (intervalMinutes=${docReminders.intervalMinutes})`);
  } else {
    console.log(`[DocumentReminders] Scheduler not started (${docReminders.reason})`);
  }
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = process.env.NODE_ENV === "production" ? preferredPort : await findAvailablePort(preferredPort);
  if (process.env.NODE_ENV !== "production" && port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
