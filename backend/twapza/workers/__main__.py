"""Start an RQ worker: ``python -m twapza.workers``."""

import logging

from rq import Worker

from twapza.config import get_settings
from twapza.db.session import get_engine, init_db
from twapza.queue import get_queue, get_redis, with_priority


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    init_db()
    # RQ forks a child per job; drop the parent's connections so each child
    # opens its own SQLite connections.
    get_engine().dispose()
    get_engine.cache_clear()
    settings = get_settings()
    # Pro accounts' jobs go to the priority queue, which is always emptied first.
    queue = get_queue()
    worker = Worker([with_priority(queue, True), queue], connection=get_redis(), name=None)
    logging.getLogger(__name__).info("Twapza worker listening on queues %r (+ -priority)", settings.queue_name)
    worker.work(with_scheduler=False)


if __name__ == "__main__":
    main()
