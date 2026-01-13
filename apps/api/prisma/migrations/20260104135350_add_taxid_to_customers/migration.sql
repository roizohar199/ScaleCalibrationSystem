/*
  Warnings:

  - Added the required column `taxId` to the `customers` table without a default value. This is not possible if the table is not empty.
  - Made the column `address` on table `customers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `contact` on table `customers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `phone` on table `customers` required. This step will fail if there are existing NULL values in that column.

*/
-- First, add the column as nullable
ALTER TABLE "customers" ADD COLUMN     "taxId" TEXT;

-- Update existing rows with default values
UPDATE "customers" SET "taxId" = '000000000' WHERE "taxId" IS NULL;
UPDATE "customers" SET "address" = '' WHERE "address" IS NULL;
UPDATE "customers" SET "contact" = '' WHERE "contact" IS NULL;
UPDATE "customers" SET "phone" = '' WHERE "phone" IS NULL;

-- Now make the columns required
ALTER TABLE "customers" ALTER COLUMN "taxId" SET NOT NULL;
ALTER TABLE "customers" ALTER COLUMN "address" SET NOT NULL;
ALTER TABLE "customers" ALTER COLUMN "contact" SET NOT NULL;
ALTER TABLE "customers" ALTER COLUMN "phone" SET NOT NULL;

-- CreateIndex
CREATE INDEX "customers_taxId_idx" ON "customers"("taxId");
