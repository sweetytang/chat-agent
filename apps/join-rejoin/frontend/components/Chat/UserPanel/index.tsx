import { useAuthStore } from "../../../store";
import styles from "./index.module.scss";

export default function UserPanel() {
    const currentUser = useAuthStore((state) => state.currentUser);
    const logout = useAuthStore((state) => state.logout);

    if (!currentUser) {
        return null;
    }

    return (
        <div className={styles.accountInline}>
            <div className={styles.accountCard}>
                <div className={styles.accountMeta}>
                    <div className={styles.accountLabel}>当前用户</div>
                    <div className={styles.accountNameRow}>
                        <span className={styles.accountStatusDot} />
                        <span className={styles.accountName}>{currentUser.username}</span>
                    </div>
                </div>
                <button
                    className={styles.accountAction}
                    onClick={() => logout()}
                >
                    退出
                </button>
            </div>
        </div>
    );
}
