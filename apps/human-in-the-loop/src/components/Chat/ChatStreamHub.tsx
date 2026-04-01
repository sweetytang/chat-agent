import { useShallow } from 'zustand/react/shallow';
import { getActiveWorkerIdsSnapshot, useStreamStore } from '../../store';
import ThreadStreamWorker from './ThreadStreamWorker';

export default function ChatStreamHub() {
    const workerIds = useStreamStore(useShallow(getActiveWorkerIdsSnapshot));

    return (
        <>
            {workerIds.map((workerId) => (
                <ThreadStreamWorker key={workerId} workerId={workerId} />
            ))}
        </>
    );
}
