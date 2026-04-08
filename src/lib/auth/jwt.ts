import { SignJWT, jwtVerify } from "jose";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";

export type AuthPayload = {
  userId: string;
  activeOrgId: string;
  role: string;
};

export { AUTH_COOKIE_NAME };

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
};

export async function signToken(
  payload: AuthPayload,
  expiresIn: string | number = "7d"
) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecret());
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, getSecret());
  return payload as AuthPayload;
}
