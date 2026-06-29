import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(192,57,43,0.12),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(231,76,60,0.12),_transparent_30%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}
