import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";

import { db } from "@/lib/db";
import { ensureDefaultWorkspace } from "@/lib/workspace";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const providers = [
  Credentials({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const parsed = credentialsSchema.safeParse(credentials);

      if (!parsed.success) {
        return null;
      }

      const user = await db.user.findUnique({
        where: { email: parsed.data.email },
      });

      if (!user?.password) {
        return null;
      }

      const isValid = await bcrypt.compare(parsed.data.password, user.password);

      if (!isValid) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        preferences:
          typeof user.preferences === "object" && user.preferences
            ? (user.preferences as Record<string, unknown>)
            : null,
      };
    },
  }),
  ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID,
          clientSecret: process.env.AUTH_GOOGLE_SECRET,
          allowDangerousEmailAccountLinking: true,
        }),
      ]
    : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  trustHost: true,
  session: {
    strategy: "database",
  },
  pages: {
    signIn: "/login",
  },
  providers,
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }

      return session;
    },
  },
  events: {
    async createUser({ user }) {
      await ensureDefaultWorkspace(user.id);
    },
  },
});
