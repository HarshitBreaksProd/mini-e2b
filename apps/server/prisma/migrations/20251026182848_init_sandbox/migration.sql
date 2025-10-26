-- CreateTable
CREATE TABLE "sandbox" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sandbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sandbox_containerId_key" ON "sandbox"("containerId");
