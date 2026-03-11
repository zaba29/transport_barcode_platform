import { LoginForm } from "@/components/login-form";

type PageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const nextPath = params.next ?? "/";

  return <LoginForm nextPath={nextPath} />;
}
