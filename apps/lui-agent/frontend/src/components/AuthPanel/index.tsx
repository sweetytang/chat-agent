import { FormEvent, useState } from "react";
import { useAuthStore } from "@/store/auth";
import styles from "./index.module.css";

export function AuthPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { token, error, login, logout } = useAuthStore();
  async function submit(event: FormEvent) { event.preventDefault(); await login(email, password); }
  if (token) return <div className={styles.panel}><strong>已登录</strong><button onClick={logout} type="button">退出登录</button></div>;
  return <form className={styles.panel} onSubmit={submit}><strong>登录后加载你的会话</strong><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="邮箱" required /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="密码（至少 8 位）" minLength={8} required /><button type="submit">登录</button>{error && <small>{error}</small>}</form>;
}
