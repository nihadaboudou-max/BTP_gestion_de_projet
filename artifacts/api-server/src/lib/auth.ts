import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "hairou-btp-secret-2024";
const REFRESH_SECRET = process.env.REFRESH_SECRET || "hairou-btp-refresh-2024";

export interface JwtPayload {
  userId: number;
  email: string;
  role: string;
}

export function generateTokens(payload: JwtPayload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
  const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: "30d" });
  return { token, refreshToken };
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, REFRESH_SECRET) as JwtPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Non autorisé", message: "Token manquant" });
    return;
  }
  const token = authHeader.substring(7);
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Non autorisé", message: "Token invalide ou expiré" });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== "ADMIN") {
    res.status(403).json({ error: "Accès refusé", message: "Cette action nécessite des droits administrateur" });
    return;
  }
  next();
}
