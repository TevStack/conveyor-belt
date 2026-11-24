import LoginForm from "./login-form";

export const metadata = { title: "Sign in · Conveyor Belt" };

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  return <LoginForm linkError={params?.error === "link"} />;
}
