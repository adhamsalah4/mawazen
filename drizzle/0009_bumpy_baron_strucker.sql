CREATE TABLE `activity_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`action` enum('create','update','delete') NOT NULL,
	`entityType` enum('client','case','document') NOT NULL,
	`entityId` int NOT NULL,
	`description` text,
	`oldData` datetime,
	`newData` datetime,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `appSettings` (
	`key` varchar(64) NOT NULL,
	`value` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appSettings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `blogPosts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`slug` varchar(150) NOT NULL,
	`title` varchar(255) NOT NULL,
	`excerpt` text,
	`content` text,
	`isPublished` boolean NOT NULL DEFAULT true,
	`publishedAt` datetime,
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `blogPosts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contactMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320),
	`phone` varchar(20),
	`message` text NOT NULL,
	`status` enum('new','replied','closed') NOT NULL DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contactMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `legalCrawlerRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` datetime,
	`status` enum('running','success','error') NOT NULL DEFAULT 'running',
	`pagesCrawled` int NOT NULL DEFAULT 0,
	`documentsUpdated` int NOT NULL DEFAULT 0,
	`error` longtext,
	CONSTRAINT `legalCrawlerRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `legalSourceChunks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`chunkIndex` int NOT NULL,
	`text` text NOT NULL,
	`embeddingJson` text,
	`metaJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `legalSourceChunks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `legalSourceDocuments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(64) NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`contentText` longtext,
	`contentHash` varchar(64),
	`httpStatus` int,
	`etag` varchar(255),
	`lastModified` varchar(255),
	`fetchedAt` datetime,
	`status` enum('ok','error','skipped') NOT NULL DEFAULT 'ok',
	`error` longtext,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `legalSourceDocuments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255),
	`subscriptionPlan` enum('individual','law_firm','enterprise') NOT NULL DEFAULT 'individual',
	`seatLimit` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `practiceAreas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `practiceAreas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `promoRedemptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`paymentId` varchar(128) NOT NULL,
	`promoCode` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `promoRedemptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `promoRedemptions_paymentId_unique` UNIQUE(`paymentId`)
);
--> statement-breakpoint
CREATE TABLE `publicTeamMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`title` varchar(255),
	`bio` text,
	`avatarUrl` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `publicTeamMembers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `referralRedemptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referrerUserId` int NOT NULL,
	`referredUserId` int NOT NULL,
	`paymentId` varchar(128) NOT NULL,
	`referralCode` varchar(24) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `referralRedemptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `referralRedemptions_paymentId_unique` UNIQUE(`paymentId`)
);
--> statement-breakpoint
CREATE TABLE `serviceCatalog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`durationMinutes` int NOT NULL DEFAULT 60,
	`priceAmount` bigint NOT NULL DEFAULT 0,
	`currency` varchar(10) NOT NULL DEFAULT 'SAR',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `serviceCatalog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `serviceProjectExpenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`serviceProjectId` int NOT NULL,
	`amount` bigint NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'SAR',
	`description` text,
	`expenseDate` timestamp NOT NULL DEFAULT (now()),
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `serviceProjectExpenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `serviceProjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`serviceCatalogId` int,
	`clientId` int,
	`caseId` int,
	`title` varchar(255) NOT NULL,
	`description` text,
	`status` enum('new','in_progress','on_hold','completed','cancelled') NOT NULL DEFAULT 'new',
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`assignedToUserId` int,
	`createdByUserId` int,
	`startDate` datetime,
	`dueDate` datetime,
	`completedAt` datetime,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `serviceProjects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `serviceRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`serviceId` int,
	`clientName` varchar(255) NOT NULL,
	`clientEmail` varchar(320),
	`clientPhone` varchar(20),
	`notes` text,
	`preferredAt` datetime,
	`status` enum('new','in_progress','completed','cancelled') NOT NULL DEFAULT 'new',
	`assignedToUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `serviceRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sitePages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`slug` varchar(100) NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text,
	`isPublished` boolean NOT NULL DEFAULT true,
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sitePages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptionPayments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`paymentId` varchar(128) NOT NULL,
	`plan` enum('individual','law_firm','enterprise') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscriptionPayments_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscriptionPayments_paymentId_unique` UNIQUE(`paymentId`)
);
--> statement-breakpoint
CREATE TABLE `testimonials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`clientName` varchar(255) NOT NULL,
	`clientTitle` varchar(255),
	`content` text NOT NULL,
	`rating` int NOT NULL DEFAULT 5,
	`isPublished` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `testimonials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `toolUsage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`tool` varchar(64) NOT NULL,
	`day` varchar(10) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `toolUsage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `calendarEvents` MODIFY COLUMN `endTime` timestamp DEFAULT (now());--> statement-breakpoint
ALTER TABLE `cases` MODIFY COLUMN `filingDate` datetime;--> statement-breakpoint
ALTER TABLE `cases` MODIFY COLUMN `nextHearingDate` datetime;--> statement-breakpoint
ALTER TABLE `cases` MODIFY COLUMN `closingDate` datetime;--> statement-breakpoint
ALTER TABLE `invoices` MODIFY COLUMN `dueDate` datetime;--> statement-breakpoint
ALTER TABLE `invoices` MODIFY COLUMN `paidDate` datetime;--> statement-breakpoint
ALTER TABLE `tasks` MODIFY COLUMN `completedAt` datetime;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `isActive` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `clients` ADD `portalToken` varchar(64);--> statement-breakpoint
ALTER TABLE `clients` ADD `portalEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `serviceProjectId` int;--> statement-breakpoint
ALTER TABLE `documents` ADD `isSharedWithClient` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `templateCategory` varchar(100);--> statement-breakpoint
ALTER TABLE `documents` ADD `expiresAt` datetime;--> statement-breakpoint
ALTER TABLE `documents` ADD `renewAt` datetime;--> statement-breakpoint
ALTER TABLE `documents` ADD `reminderDays` int DEFAULT 30;--> statement-breakpoint
ALTER TABLE `documents` ADD `lastReminderSentAt` datetime;--> statement-breakpoint
ALTER TABLE `invoices` ADD `serviceProjectId` int;--> statement-breakpoint
ALTER TABLE `tasks` ADD `serviceProjectId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `organizationId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `accountType` enum('individual','law_firm','enterprise') DEFAULT 'individual' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `subscriptionPlan` enum('individual','law_firm','enterprise') DEFAULT 'individual' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `seatLimit` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `referralCode` varchar(24);--> statement-breakpoint
ALTER TABLE `users` ADD `subscriptionEndsAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_phone_unique` UNIQUE(`phone`);