import pytest

from app.modules.checkpoints.tree import Checkpoint, CheckpointTree


def test_branch_lineage_and_edit_parent() -> None:
    tree = CheckpointTree()
    tree.add(Checkpoint("root", None))
    tree.add(Checkpoint("answer-a", "root"))
    tree.add(Checkpoint("answer-b", "root"))

    assert [item.id for item in tree.lineage("answer-b")] == ["root", "answer-b"]
    assert tree.fork_parent("answer-b") == "root"
    assert [item.id for item in tree.children("root")] == ["answer-a", "answer-b"]


def test_checkpoint_parent_must_exist() -> None:
    tree = CheckpointTree()
    with pytest.raises(ValueError, match="Parent checkpoint"):
        tree.add(Checkpoint("child", "missing"))
