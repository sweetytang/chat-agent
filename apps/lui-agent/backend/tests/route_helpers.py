def route_paths(application) -> set[str]:
    paths: set[str] = set()
    for route in application.routes:
        if hasattr(route, "path"):
            paths.add(route.path)
        paths.update(child.path for child in getattr(route, "routes", []) if hasattr(child, "path"))
        original_router = getattr(route, "original_router", None)
        if original_router is not None:
            prefix = getattr(getattr(route, "include_context", None), "prefix", "")
            paths.update(
                f"{prefix}{child.path}"
                for child in getattr(original_router, "routes", [])
                if hasattr(child, "path")
            )
    return paths
