-- CreateTable
CREATE TABLE "public"."UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastName" TEXT,
    "firstName" TEXT,
    "lastNameKana" TEXT,
    "firstNameKana" TEXT,
    "birthDate" TIMESTAMP(3),
    "gender" TEXT,
    "phone" TEXT,
    "postalCode" TEXT,
    "prefecture" TEXT,
    "city" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "businessName" TEXT,
    "startDate" TIMESTAMP(3),
    "occupation" TEXT,
    "invoiceNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "public"."UserProfile"("userId");

-- AddForeignKey
ALTER TABLE "public"."UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
