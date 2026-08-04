import { useState, type FormEvent } from "react";

import { useAuthStore } from "@/store/auth";
import styles from "./index.module.css";

export function AuthPanel() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { token, error, login, register, logout } = useAuthStore();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (isRegistering && password !== confirmPassword) return;
    if (isRegistering) await register(email, password);
    else await login(email, password);
  }
  if (token) return <div className={styles.panel}><strong>已登录</strong><button onClick={() => void logout()} type="button">退出登录</button></div>;
  return <form className={styles.panel} onSubmit={submit}>
    <strong>{isRegistering ? "创建账户" : "登录后加载你的会话"}</strong>
    <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="邮箱" required />
    <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="密码（至少 8 位）" minLength={8} required />
    {isRegistering && <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="确认密码" minLength={8} required />}
    {isRegistering && password !== confirmPassword && confirmPassword && <small>两次密码不一致</small>}
    <button type="submit">{isRegistering ? "注册并进入" : "登录"}</button>
    {error && <small>{error}</small>}
    <button type="button" onClick={() => { setIsRegistering((value) => !value); setConfirmPassword(""); }}>
      {isRegistering ? "已有账号？去登录" : "没有账号？去注册"}
    </button>
  </form>;
}
