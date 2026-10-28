-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('CONFIRMED', 'IN_PRODUCTION', 'DISPATCHED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InstallationStatus" AS ENUM ('PENDING', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommissioningStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SerialStatus" AS ENUM ('IN_STOCK', 'DISPATCHED', 'INSTALLED', 'COMMISSIONED', 'SCRAPPED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'ASSIGNED', 'VISIT', 'DIAGNOSIS', 'PARTS', 'REPAIR', 'CLOSED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AmcStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AmcVisitStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'SKIPPED');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "dealerId" TEXT;

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modelCode" TEXT NOT NULL,
    "category" TEXT,
    "series" TEXT,
    "description" TEXT,
    "isSparePart" BOOLEAN NOT NULL DEFAULT false,
    "heatingCapacityKw" DECIMAL(8,2),
    "inputPowerKw" DECIMAL(8,2),
    "cop" DECIMAL(5,2),
    "refrigerant" TEXT,
    "compressor" TEXT,
    "operatingRange" TEXT,
    "heatExchanger" TEXT,
    "warrantyMonths" INTEGER NOT NULL DEFAULT 12,
    "dealerPrice" DECIMAL(12,2),
    "customerPrice" DECIMAL(12,2),
    "stockQty" INTEGER NOT NULL DEFAULT 0,
    "datasheetUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "quotationId" TEXT,
    "createdById" TEXT NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryDate" TIMESTAMP(3),
    "paymentTerms" TEXT,
    "customerPoNumber" TEXT,
    "billingAddress" TEXT,
    "shippingAddress" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gstPct" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "installationCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "transportCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amountReceived" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "transporter" TEXT,
    "lrNumber" TEXT,
    "ewayBillNo" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "SalesOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerialNumber" (
    "id" TEXT NOT NULL,
    "serialNo" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "SerialStatus" NOT NULL DEFAULT 'IN_STOCK',
    "manufacturedOn" TIMESTAMP(3),
    "leadId" TEXT,
    "salesOrderId" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "installationId" TEXT,
    "installedAt" TIMESTAMP(3),
    "commissionedAt" TIMESTAMP(3),
    "warrantyStartsOn" TIMESTAMP(3),
    "warrantyEndsOn" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SerialNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installation" (
    "id" TEXT NOT NULL,
    "jobNumber" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "salesOrderId" TEXT,
    "createdById" TEXT NOT NULL,
    "technicianId" TEXT,
    "status" "InstallationStatus" NOT NULL DEFAULT 'PENDING',
    "siteAddress" TEXT,
    "contactPerson" TEXT,
    "contactPhone" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "remarks" TEXT,
    "customerSignedBy" TEXT,
    "customerSignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commissioning" (
    "id" TEXT NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "engineerId" TEXT,
    "status" "CommissioningStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "customerDemoDone" BOOLEAN NOT NULL DEFAULT false,
    "customerApprovedBy" TEXT,
    "customerApprovedAt" TIMESTAMP(3),
    "engineerRemarks" TEXT,
    "commissionedOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commissioning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTicket" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "serialNumberId" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "complaintType" TEXT,
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "slaDueAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "visitScheduledFor" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "diagnosis" TEXT,
    "resolution" TEXT,
    "customerSignedOffBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketPart" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyClaim" (
    "id" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "serialNumberId" TEXT NOT NULL,
    "ticketId" TEXT,
    "issue" TEXT NOT NULL,
    "claimedParts" TEXT,
    "status" "ClaimStatus" NOT NULL DEFAULT 'SUBMITTED',
    "decisionNote" TEXT,
    "resolution" TEXT,
    "createdById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmcContract" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "AmcStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "visitsPerYear" INTEGER NOT NULL DEFAULT 2,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "coveredParts" TEXT,
    "notes" TEXT,
    "renewedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmcContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmcUnit" (
    "amcId" TEXT NOT NULL,
    "serialNumberId" TEXT NOT NULL,

    CONSTRAINT "AmcUnit_pkey" PRIMARY KEY ("amcId","serialNumberId")
);

-- CreateTable
CREATE TABLE "AmcVisit" (
    "id" TEXT NOT NULL,
    "amcId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "AmcVisitStatus" NOT NULL DEFAULT 'SCHEDULED',
    "technicianId" TEXT,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "AmcVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dealer" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "territory" TEXT,
    "gstin" TEXT,
    "outstandingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dealer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerTarget" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "targetAmount" DECIMAL(14,2) NOT NULL,
    "incentivePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealerTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerStock" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DealerStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "bankDetails" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettingOption" (
    "id" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SettingOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaPolicy" (
    "priority" "TicketPriority" NOT NULL,
    "resolutionHours" INTEGER NOT NULL,

    CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("priority")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_modelCode_key" ON "Product"("modelCode");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_series_idx" ON "Product"("series");

-- CreateIndex
CREATE INDEX "Product_active_idx" ON "Product"("active");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_orderNumber_key" ON "SalesOrder"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_quotationId_key" ON "SalesOrder"("quotationId");

-- CreateIndex
CREATE INDEX "SalesOrder_leadId_idx" ON "SalesOrder"("leadId");

-- CreateIndex
CREATE INDEX "SalesOrder_status_idx" ON "SalesOrder"("status");

-- CreateIndex
CREATE INDEX "SalesOrder_createdById_idx" ON "SalesOrder"("createdById");

-- CreateIndex
CREATE INDEX "SalesOrderItem_orderId_idx" ON "SalesOrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "SerialNumber_serialNo_key" ON "SerialNumber"("serialNo");

-- CreateIndex
CREATE INDEX "SerialNumber_productId_idx" ON "SerialNumber"("productId");

-- CreateIndex
CREATE INDEX "SerialNumber_status_idx" ON "SerialNumber"("status");

-- CreateIndex
CREATE INDEX "SerialNumber_leadId_idx" ON "SerialNumber"("leadId");

-- CreateIndex
CREATE INDEX "SerialNumber_salesOrderId_idx" ON "SerialNumber"("salesOrderId");

-- CreateIndex
CREATE INDEX "SerialNumber_installationId_idx" ON "SerialNumber"("installationId");

-- CreateIndex
CREATE INDEX "SerialNumber_warrantyEndsOn_idx" ON "SerialNumber"("warrantyEndsOn");

-- CreateIndex
CREATE UNIQUE INDEX "Installation_jobNumber_key" ON "Installation"("jobNumber");

-- CreateIndex
CREATE INDEX "Installation_leadId_idx" ON "Installation"("leadId");

-- CreateIndex
CREATE INDEX "Installation_status_idx" ON "Installation"("status");

-- CreateIndex
CREATE INDEX "Installation_technicianId_idx" ON "Installation"("technicianId");

-- CreateIndex
CREATE INDEX "Installation_salesOrderId_idx" ON "Installation"("salesOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Commissioning_reportNumber_key" ON "Commissioning"("reportNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Commissioning_installationId_key" ON "Commissioning"("installationId");

-- CreateIndex
CREATE INDEX "Commissioning_status_idx" ON "Commissioning"("status");

-- CreateIndex
CREATE INDEX "Commissioning_engineerId_idx" ON "Commissioning"("engineerId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceTicket_ticketNumber_key" ON "ServiceTicket"("ticketNumber");

-- CreateIndex
CREATE INDEX "ServiceTicket_leadId_idx" ON "ServiceTicket"("leadId");

-- CreateIndex
CREATE INDEX "ServiceTicket_status_idx" ON "ServiceTicket"("status");

-- CreateIndex
CREATE INDEX "ServiceTicket_priority_idx" ON "ServiceTicket"("priority");

-- CreateIndex
CREATE INDEX "ServiceTicket_assignedToId_idx" ON "ServiceTicket"("assignedToId");

-- CreateIndex
CREATE INDEX "ServiceTicket_serialNumberId_idx" ON "ServiceTicket"("serialNumberId");

-- CreateIndex
CREATE INDEX "TicketPart_ticketId_idx" ON "TicketPart"("ticketId");

-- CreateIndex
CREATE INDEX "TicketPart_productId_idx" ON "TicketPart"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaim_claimNumber_key" ON "WarrantyClaim"("claimNumber");

-- CreateIndex
CREATE INDEX "WarrantyClaim_serialNumberId_idx" ON "WarrantyClaim"("serialNumberId");

-- CreateIndex
CREATE INDEX "WarrantyClaim_status_idx" ON "WarrantyClaim"("status");

-- CreateIndex
CREATE INDEX "WarrantyClaim_ticketId_idx" ON "WarrantyClaim"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "AmcContract_contractNumber_key" ON "AmcContract"("contractNumber");

-- CreateIndex
CREATE INDEX "AmcContract_leadId_idx" ON "AmcContract"("leadId");

-- CreateIndex
CREATE INDEX "AmcContract_status_idx" ON "AmcContract"("status");

-- CreateIndex
CREATE INDEX "AmcContract_endDate_idx" ON "AmcContract"("endDate");

-- CreateIndex
CREATE INDEX "AmcUnit_serialNumberId_idx" ON "AmcUnit"("serialNumberId");

-- CreateIndex
CREATE INDEX "AmcVisit_amcId_idx" ON "AmcVisit"("amcId");

-- CreateIndex
CREATE INDEX "AmcVisit_status_scheduledFor_idx" ON "AmcVisit"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "Dealer_code_key" ON "Dealer"("code");

-- CreateIndex
CREATE INDEX "Dealer_territory_idx" ON "Dealer"("territory");

-- CreateIndex
CREATE INDEX "Dealer_active_idx" ON "Dealer"("active");

-- CreateIndex
CREATE INDEX "DealerTarget_dealerId_idx" ON "DealerTarget"("dealerId");

-- CreateIndex
CREATE INDEX "DealerStock_productId_idx" ON "DealerStock"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "DealerStock_dealerId_productId_key" ON "DealerStock"("dealerId", "productId");

-- CreateIndex
CREATE INDEX "SettingOption_group_idx" ON "SettingOption"("group");

-- CreateIndex
CREATE UNIQUE INDEX "SettingOption_group_value_key" ON "SettingOption"("group", "value");

-- CreateIndex
CREATE INDEX "Lead_dealerId_idx" ON "Lead"("dealerId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialNumber" ADD CONSTRAINT "SerialNumber_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commissioning" ADD CONSTRAINT "Commissioning_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commissioning" ADD CONSTRAINT "Commissioning_engineerId_fkey" FOREIGN KEY ("engineerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_serialNumberId_fkey" FOREIGN KEY ("serialNumberId") REFERENCES "SerialNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPart" ADD CONSTRAINT "TicketPart_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ServiceTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPart" ADD CONSTRAINT "TicketPart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_serialNumberId_fkey" FOREIGN KEY ("serialNumberId") REFERENCES "SerialNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ServiceTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmcContract" ADD CONSTRAINT "AmcContract_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmcContract" ADD CONSTRAINT "AmcContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmcContract" ADD CONSTRAINT "AmcContract_renewedFromId_fkey" FOREIGN KEY ("renewedFromId") REFERENCES "AmcContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmcUnit" ADD CONSTRAINT "AmcUnit_amcId_fkey" FOREIGN KEY ("amcId") REFERENCES "AmcContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmcUnit" ADD CONSTRAINT "AmcUnit_serialNumberId_fkey" FOREIGN KEY ("serialNumberId") REFERENCES "SerialNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmcVisit" ADD CONSTRAINT "AmcVisit_amcId_fkey" FOREIGN KEY ("amcId") REFERENCES "AmcContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmcVisit" ADD CONSTRAINT "AmcVisit_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerTarget" ADD CONSTRAINT "DealerTarget_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerStock" ADD CONSTRAINT "DealerStock_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerStock" ADD CONSTRAINT "DealerStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Default reference data. Everything below is editable later under Settings.
-- ---------------------------------------------------------------------------

INSERT INTO "CompanyProfile" ("id", "legalName", "website", "updatedAt")
VALUES ('singleton', 'Adreco Engineering Pvt Ltd', 'https://adreco.in', CURRENT_TIMESTAMP);

INSERT INTO "SlaPolicy" ("priority", "resolutionHours") VALUES
  ('CRITICAL', 4),
  ('HIGH', 24),
  ('MEDIUM', 48),
  ('LOW', 72);

INSERT INTO "SettingOption" ("id", "group", "value", "sortOrder") VALUES
  (gen_random_uuid()::text, 'LEAD_SOURCE', 'Website enquiry', 1),
  (gen_random_uuid()::text, 'LEAD_SOURCE', 'Referral', 2),
  (gen_random_uuid()::text, 'LEAD_SOURCE', 'Dealer', 3),
  (gen_random_uuid()::text, 'LEAD_SOURCE', 'Walk-in', 4),
  (gen_random_uuid()::text, 'LEAD_SOURCE', 'Exhibition', 5),
  (gen_random_uuid()::text, 'LEAD_SOURCE', 'Cold call', 6),
  (gen_random_uuid()::text, 'LEAD_SOURCE', 'Social media', 7),
  (gen_random_uuid()::text, 'LEAD_SOURCE', 'Repeat customer', 8),

  (gen_random_uuid()::text, 'PAYMENT_TERM', '100% advance', 1),
  (gen_random_uuid()::text, 'PAYMENT_TERM', '50% advance, balance before dispatch', 2),
  (gen_random_uuid()::text, 'PAYMENT_TERM', '30% advance, 60% against delivery, 10% after commissioning', 3),
  (gen_random_uuid()::text, 'PAYMENT_TERM', 'Net 30 days', 4),

  (gen_random_uuid()::text, 'PRODUCT_CATEGORY', 'Commercial Heat Pump', 1),
  (gen_random_uuid()::text, 'PRODUCT_CATEGORY', 'Domestic Heat Pump', 2),
  (gen_random_uuid()::text, 'PRODUCT_CATEGORY', 'EVI Heat Pump', 3),
  (gen_random_uuid()::text, 'PRODUCT_CATEGORY', 'Heat Pump Central Heating System', 4),
  (gen_random_uuid()::text, 'PRODUCT_CATEGORY', 'Swimming Pool Heat Pump', 5),

  (gen_random_uuid()::text, 'COMPLAINT_TYPE', 'Not heating / low heating output', 1),
  (gen_random_uuid()::text, 'COMPLAINT_TYPE', 'Compressor not starting', 2),
  (gen_random_uuid()::text, 'COMPLAINT_TYPE', 'Error code on controller', 3),
  (gen_random_uuid()::text, 'COMPLAINT_TYPE', 'Water leakage', 4),
  (gen_random_uuid()::text, 'COMPLAINT_TYPE', 'Abnormal noise or vibration', 5),
  (gen_random_uuid()::text, 'COMPLAINT_TYPE', 'Power tripping', 6),
  (gen_random_uuid()::text, 'COMPLAINT_TYPE', 'Low water flow', 7),
  (gen_random_uuid()::text, 'COMPLAINT_TYPE', 'Installation defect', 8),
  (gen_random_uuid()::text, 'COMPLAINT_TYPE', 'Other', 9),

  (gen_random_uuid()::text, 'TERRITORY', 'North', 1),
  (gen_random_uuid()::text, 'TERRITORY', 'South', 2),
  (gen_random_uuid()::text, 'TERRITORY', 'East', 3),
  (gen_random_uuid()::text, 'TERRITORY', 'West', 4),
  (gen_random_uuid()::text, 'TERRITORY', 'Central', 5),

  (gen_random_uuid()::text, 'WARRANTY_PERIOD', '12', 1),
  (gen_random_uuid()::text, 'WARRANTY_PERIOD', '24', 2),
  (gen_random_uuid()::text, 'WARRANTY_PERIOD', '36', 3),
  (gen_random_uuid()::text, 'WARRANTY_PERIOD', '60', 4);
