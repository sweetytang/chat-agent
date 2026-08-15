import pytest

from app.integrations.tools.registry import calculate


def test_calculator_does_not_execute_arbitrary_code() -> None:
    assert calculate("2 + 3 * 4") == 14

    with pytest.raises(ValueError):
        calculate("__import__('os').getcwd()")
