import { FormEvent, useMemo, useState } from "react";
import { useAuthStore } from "../../store";
import { AuthMode, AuthStatus } from "../../types/auth";
import styles from "./index.module.scss";

export default function AuthScreen() {
    const authMode = useAuthStore((s) => s.mode);
    const status = useAuthStore((s) => s.status);
    const error = useAuthStore((s) => s.error);
    const setMode = useAuthStore((s) => s.setMode);
    const clearError = useAuthStore((s) => s.clearError);
    const login = useAuthStore((s) => s.login);
    const register = useAuthStore((s) => s.register);

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const isLoading = status === AuthStatus.LOADING;

    const [isLogin, title] = useMemo(() => {
        const isLogin = authMode === AuthMode.LOGIN;
        return [isLogin, isLogin ? "登录你的账户" : "创建新账户"]
    }, [authMode]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        clearError();

        if (isLogin) {
            await login(username, password);
            return;
        }

        await register(username, password);
    };

    return (
        <div className={styles.authShell}>
            <div className={styles.authBackdrop} />
            <div className={styles.authCard}>
                <h1 className={styles.authTitle}>{title}</h1>
                <p className={styles.authDescription}>
                    信息隔离，安全可控。
                </p>

                <form className={styles.authForm} onSubmit={handleSubmit}>
                    <label className={styles.authField}>
                        <span>用户名</span>
                        <input
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            placeholder="输入你的用户名"
                            autoComplete="username"
                            disabled={isLoading}
                        />
                    </label>

                    <label className={styles.authField}>
                        <span>密码</span>
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="至少 6 位"
                            autoComplete={isLogin ? "current-password" : "new-password"}
                            disabled={isLoading}
                        />
                    </label>

                    {error && <div className={styles.authError}>{error}</div>}

                    <button className={styles.authSubmit} type="submit" disabled={isLoading}>
                        {isLoading ? "处理中..." : isLogin ? "登录" : "注册并进入"}
                    </button>
                </form>

                <div className={styles.authFooter}>
                    {isLogin ? "还没有账号？" : "已经有账号了？"}
                    <button
                        type="button"
                        className={styles.authSwitch}
                        onClick={() => setMode(isLogin ? AuthMode.REGISTER : AuthMode.LOGIN)}
                        disabled={isLoading}
                    >
                        {isLogin ? "去注册" : "去登录"}
                    </button>
                </div>
            </div>
        </div>
    );
}
