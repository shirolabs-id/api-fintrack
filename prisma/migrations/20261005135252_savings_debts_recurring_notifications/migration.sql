/*
  Warnings:

  - You are about to drop the column `name` on the `Debt` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `Debt` table. All the data in the column will be lost.
  - You are about to drop the column `paidAmount` on the `Debt` table. All the data in the column will be lost.
  - You are about to drop the column `principalAmount` on the `Debt` table. All the data in the column will be lost.
  - Added the required column `personName` to the `Debt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `remainingAmount` to the `Debt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDate` to the `Debt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalAmount` to the `Debt` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "DebtStatus" ADD VALUE 'partially_paid';

-- AlterEnum
ALTER TYPE "Frequency" ADD VALUE 'daily';

-- DropForeignKey
ALTER TABLE "DebtPayment" DROP CONSTRAINT "DebtPayment_accountId_fkey";

-- DropForeignKey
ALTER TABLE "SavingsContribution" DROP CONSTRAINT "SavingsContribution_accountId_fkey";

-- AlterTable
ALTER TABLE "Debt" DROP COLUMN "name",
DROP COLUMN "notes",
DROP COLUMN "paidAmount",
DROP COLUMN "principalAmount",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "personName" TEXT NOT NULL,
ADD COLUMN     "remainingAmount" INTEGER NOT NULL,
ADD COLUMN     "startDate" DATE NOT NULL,
ADD COLUMN     "totalAmount" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "DebtPayment" ALTER COLUMN "accountId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SavingGoal" ADD COLUMN     "category" TEXT,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "SavingsContribution" ALTER COLUMN "accountId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- AddForeignKey
ALTER TABLE "SavingsContribution" ADD CONSTRAINT "SavingsContribution_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
