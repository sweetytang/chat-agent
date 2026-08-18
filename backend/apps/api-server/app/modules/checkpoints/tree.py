from dataclasses import dataclass


@dataclass(frozen=True)
class Checkpoint:
    id: str
    parent_id: str | None


class CheckpointTree:
    def __init__(self) -> None:
        self._items: dict[str, Checkpoint] = {}

    def add(self, checkpoint: Checkpoint) -> None:
        if checkpoint.id in self._items:
            raise ValueError(f"Checkpoint already exists: {checkpoint.id}")
        if checkpoint.parent_id and checkpoint.parent_id not in self._items:
            raise ValueError(f"Parent checkpoint does not exist: {checkpoint.parent_id}")
        self._items[checkpoint.id] = checkpoint

    def lineage(self, checkpoint_id: str | None) -> list[Checkpoint]:
        result: list[Checkpoint] = []
        current_id = checkpoint_id
        while current_id:
            current = self._items.get(current_id)
            if current is None:
                raise ValueError(f"Checkpoint does not exist: {current_id}")
            result.append(current)
            current_id = current.parent_id
        result.reverse()
        return result

    def children(self, parent_id: str | None) -> list[Checkpoint]:
        return [item for item in self._items.values() if item.parent_id == parent_id]

    def fork_parent(self, checkpoint_id: str) -> str | None:
        return self._items[checkpoint_id].parent_id
