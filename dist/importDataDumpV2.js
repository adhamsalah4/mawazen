// server/scripts/importDataDumpV2.ts
import fs from "fs";
import path from "path";

// server/db.ts
import { eq, desc, and, like, or, sql, gte, lte, count, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

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
var inMemoryLegalDocuments = /* @__PURE__ */ new Map();
var inMemoryLegalChunks = /* @__PURE__ */ new Map();
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

// server/scripts/importDataDumpV2.ts
async function main() {
  const filePath = process.argv[2] ?? path.join(process.cwd(), "data_dump_v2.sql");
  if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath);
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, "utf8");
  const statements = content.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
  let currentDocId = null;
  let currentChunks = [];
  let chunkIndex = 0;
  for (const stmt of statements) {
    if (stmt.startsWith("INSERT INTO laws")) {
      if (currentDocId !== null) {
        await replaceLegalChunksForDocument({ documentId: currentDocId, chunks: currentChunks });
      }
      const match = stmt.match(/INSERT INTO laws \(law_name, source_url\) VALUES \('([^']+)',\s*'([^']+)'/);
      if (!match) {
        console.warn("Failed to parse law INSERT:", stmt.slice(0, 120));
        continue;
      }
      const [, lawName, sourceUrl] = match;
      const docId = await upsertLegalSourceDocument({
        source: "data_dump_v2",
        url: sourceUrl,
        title: lawName,
        contentText: null
      });
      currentDocId = docId;
      currentChunks = [];
      chunkIndex = 0;
    } else if (stmt.startsWith("INSERT INTO law_articles")) {
      if (currentDocId === null) {
        console.warn("Article found before any law. Skipping.");
        continue;
      }
      const match = stmt.match(/INSERT INTO law_articles \(law_id, article_number, article_content\) VALUES \(@last_id,\s*'([^']+)',\s*'([\s\S]*)'/);
      if (!match) {
        console.warn("Failed to parse article INSERT:", stmt.slice(0, 120));
        continue;
      }
      const [, articleNumberRaw, articleContentRaw] = match;
      const articleNumber = articleNumberRaw.replace(/\\n/g, " ").trim();
      const articleContent = articleContentRaw.replace(/\\n/g, "\n").trim();
      currentChunks.push({
        chunkIndex: chunkIndex++,
        text: articleContent,
        metaJson: JSON.stringify({ articleNumber })
      });
    }
  }
  if (currentDocId !== null) {
    await replaceLegalChunksForDocument({ documentId: currentDocId, chunks: currentChunks });
  }
  console.log("Import completed");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
