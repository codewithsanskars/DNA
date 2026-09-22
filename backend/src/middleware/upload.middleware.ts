import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { Request, Response, NextFunction } from 'express';

export const RESUME_DIR = path.join(__dirname, '../../uploads/resumes');
fs.mkdirSync(RESUME_DIR, { recursive: true });

export const JOB_DESCRIPTION_DIR = path.join(__dirname, '../../uploads/job-descriptions');
fs.mkdirSync(JOB_DESCRIPTION_DIR, { recursive: true });

export const CANDIDATE_PHOTO_DIR = path.join(__dirname, '../../uploads/candidate-photos');
fs.mkdirSync(CANDIDATE_PHOTO_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_RESUME_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_JD_SIZE = 10 * 1024 * 1024; // 10MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, RESUME_DIR),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});

const resumeUpload = multer({
  storage,
  limits: { fileSize: MAX_RESUME_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error('Resume must be a .pdf or .docx file'));
      return;
    }
    cb(null, true);
  },
}).single('resume');

/** Wraps multer's callback-style errors into the shape error.middleware.ts expects. */
export function uploadResume(req: Request, res: Response, next: NextFunction): void {
  resumeUpload(req, res, (err: any) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE' ? 'Resume must be 10MB or smaller' : err.message || 'Upload failed';
      const wrapped = Object.assign(new Error(message), { statusCode: 400 });
      next(wrapped);
      return;
    }
    next();
  });
}

const jdStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, JOB_DESCRIPTION_DIR),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});

const jobDescriptionUpload = multer({
  storage: jdStorage,
  limits: { fileSize: MAX_JD_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error('Job description must be a .pdf or .docx file'));
      return;
    }
    cb(null, true);
  },
}).single('jobDescription');

/** Wraps multer's callback-style errors into the shape error.middleware.ts expects. */
export function uploadJobDescription(req: Request, res: Response, next: NextFunction): void {
  jobDescriptionUpload(req, res, (err: any) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE' ? 'Job description must be 10MB or smaller' : err.message || 'Upload failed';
      const wrapped = Object.assign(new Error(message), { statusCode: 400 });
      next(wrapped);
      return;
    }
    next();
  });
}

const PHOTO_EXTENSIONS = ['.jpg', '.jpeg'];
const PHOTO_MIME_TYPES = ['image/jpeg'];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB

const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CANDIDATE_PHOTO_DIR),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});

const candidatePhotoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: MAX_PHOTO_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!PHOTO_EXTENSIONS.includes(ext) || !PHOTO_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error('Photo must be a .jpg or .jpeg file'));
      return;
    }
    cb(null, true);
  },
}).single('photo');

/** Wraps multer's callback-style errors into the shape error.middleware.ts expects. */
export function uploadCandidatePhoto(req: Request, res: Response, next: NextFunction): void {
  candidatePhotoUpload(req, res, (err: any) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Photo must be 5MB or smaller' : err.message || 'Upload failed';
      const wrapped = Object.assign(new Error(message), { statusCode: 400 });
      next(wrapped);
      return;
    }
    next();
  });
}
