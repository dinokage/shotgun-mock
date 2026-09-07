-- AlterTable
ALTER TABLE "annotations" ADD COLUMN     "created_by_client_access_link_id" TEXT,
ALTER COLUMN "created_by_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "reviewer_client_access_link_id" TEXT,
ALTER COLUMN "reviewer_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_created_by_client_access_link_id_fk" FOREIGN KEY ("created_by_client_access_link_id") REFERENCES "client_access_links"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_client_access_link_id_fk" FOREIGN KEY ("reviewer_client_access_link_id") REFERENCES "client_access_links"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

