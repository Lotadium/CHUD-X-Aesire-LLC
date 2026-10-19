-- Addition of record flagging
-- Run only in Neon after database_schema.sql.
-- Existing rows updated with is_flagged = false. 

ALTER TABLE organization 
    ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN NOT NULL DEFAULT false, 
    ADD COLUMN IF NOT EXISTS flag_reason VARCHAR(500);

ALTER TABLE person       
    ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN NOT NULL DEFAULT false, 
    ADD COLUMN IF NOT EXISTS flag_reason VARCHAR(500);

ALTER TABLE position   
    ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN NOT NULL DEFAULT false, 
    ADD COLUMN IF NOT EXISTS flag_reason VARCHAR(500);

ALTER TABLE email        
    ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN NOT NULL DEFAULT false, 
    ADD COLUMN IF NOT EXISTS flag_reason VARCHAR(500);