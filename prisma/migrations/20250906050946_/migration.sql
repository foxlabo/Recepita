-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VerificationToken" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "public"."Business" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "taxId" TEXT,
    "bankName" TEXT,
    "bankBranch" TEXT,
    "bankType" TEXT,
    "bankAccount" TEXT,
    "holder" TEXT,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InvoiceDefaults" (
    "businessId" TEXT NOT NULL,
    "taxRate" INTEGER NOT NULL DEFAULT 10,
    "roundingMode" TEXT NOT NULL DEFAULT 'round',
    "withhold" BOOLEAN NOT NULL DEFAULT false,
    "numberRule" TEXT NOT NULL DEFAULT '{YYYY}{MM}-{####}',

    CONSTRAINT "InvoiceDefaults_pkey" PRIMARY KEY ("businessId")
);

-- CreateTable
CREATE TABLE "public"."Partner" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Expense" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "vendor" TEXT NOT NULL,
    "category" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Invoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "issueDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT '下書き',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Business_userId_key" ON "public"."Business"("userId");

-- AddForeignKey
ALTER TABLE "public"."Business" ADD CONSTRAINT "Business_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceDefaults" ADD CONSTRAINT "InvoiceDefaults_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
