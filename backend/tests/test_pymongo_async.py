import os
import uuid
from urllib.parse import urlparse

import pytest
import pytest_asyncio
from pymongo import ASCENDING, AsyncMongoClient, IndexModel


@pytest_asyncio.fixture
async def test_collection():
    uri = os.environ.get("MONGO_TEST_URL")
    if not uri:
        pytest.skip("Set MONGO_TEST_URL to a local MongoDB instance to run driver tests")

    host = urlparse(uri).hostname
    if host not in {"localhost", "127.0.0.1", "::1"}:
        pytest.fail("MONGO_TEST_URL must point to a local MongoDB instance")

    client = AsyncMongoClient(uri, serverSelectionTimeoutMS=5000)
    collection = client[
        os.environ.get("MONGO_TEST_DB_NAME", "days180_driver_tests")
    ][f"async-driver-{uuid.uuid4().hex}"]
    try:
        await client.admin.command("ping")
        yield collection
    finally:
        await collection.drop()
        await client.close()


@pytest.mark.asyncio
async def test_async_crud_cursors_aggregation_and_indexes(test_collection):
    await test_collection.create_indexes(
        [
            IndexModel([("email", ASCENDING)], unique=True, name="email_unique"),
            IndexModel(
                [("expires_at", ASCENDING)],
                expireAfterSeconds=0,
                name="expires_at_ttl",
            ),
        ]
    )
    await test_collection.insert_many(
        [
            {"email": "one@example.test", "score": 1},
            {"email": "two@example.test", "score": 2},
        ]
    )
    updated = await test_collection.update_one(
        {"email": "one@example.test"}, {"$set": {"score": 3}}
    )
    assert updated.modified_count == 1
    assert (await test_collection.find_one({"email": "one@example.test"}))["score"] == 3

    documents = await test_collection.find({}).sort("score", ASCENDING).to_list(10)
    aggregate_cursor = await test_collection.aggregate(
        [{"$group": {"_id": None, "score_total": {"$sum": "$score"}}}]
    )
    totals = await aggregate_cursor.to_list(10)
    index_cursor = await test_collection.list_indexes()
    indexes = await index_cursor.to_list(10)

    assert [document["score"] for document in documents] == [2, 3]
    assert totals[0]["score_total"] == 5
    assert {index["name"] for index in indexes} >= {
        "_id_",
        "email_unique",
        "expires_at_ttl",
    }
    assert next(index for index in indexes if index["name"] == "email_unique")[
        "unique"
    ]
    assert next(index for index in indexes if index["name"] == "expires_at_ttl")[
        "expireAfterSeconds"
    ] == 0

    deleted = await test_collection.delete_one({"email": "two@example.test"})
    assert deleted.deleted_count == 1
