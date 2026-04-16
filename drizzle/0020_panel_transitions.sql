-- Migration: Panel-to-Panel Transitions
-- Add cross-dissolve to transition enum and add transition_duration column

ALTER TABLE `panels` MODIFY COLUMN `transition` enum('cut','fade','dissolve','cross-dissolve') DEFAULT 'cut';

ALTER TABLE `panels` ADD COLUMN `transition_duration` float DEFAULT 0.5;
