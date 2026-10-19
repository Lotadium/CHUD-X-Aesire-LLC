-- Addition of record flagging
-- Run only in Neon after database_schema.sq.
-- Existing rows updated with is_flagges = false. 

ALTER TABLE organization 
    ADD COLUMN is_flagged BOOLEAN NOT NULL DEFAULT false, 
    ADD COLUMN flag_reason VARCHAR(500);

ALTER TABLE person       
    ADD COLUMN is_flagged BOOLEAN NOT NULL DEFAULT false, 
    ADD COLUMN flag_reason VARCHAR(500);

ALTER TABLE position   
    ADD COLUMN is_flagged BOOLEAN NOT NULL DEFAULT false, 
    ADD COLUMN flag_reason VARCHAR(500);

ALTER TABLE email        
    ADD COLUMN is_flagged BOOLEAN NOT NULL DEFAULT false, 
    ADD COLUMN flag_reason VARCHAR(500);