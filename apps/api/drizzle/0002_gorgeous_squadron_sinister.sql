CREATE TABLE "place_notes" (
	"user_id" text NOT NULL,
	"business_id" text NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_notes_user_id_business_id_pk" PRIMARY KEY("user_id","business_id"),
	CONSTRAINT "place_note_length" CHECK (length("place_notes"."body") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "place_notes" ADD CONSTRAINT "place_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_notes" ADD CONSTRAINT "place_notes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;