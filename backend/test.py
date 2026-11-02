from scholarBox import (
    fetch_all_scholarships,
    get_db_connection,
    sync_scholarships,
    remove_missing_scholarships
)


def run_test_1(all_scholarships):
    print("\n========== TEST 1: TOP 5 ==========")

    selected = all_scholarships[:5]

    conn = get_db_connection()
    try:
        sync_scholarships(selected)
        deleted = remove_missing_scholarships(selected, conn)

        print(f"Processed: {len(selected)} scholarships")
        print(f"Deleted: {deleted}")
    finally:
        conn.close()


def run_test_2(all_scholarships):
    print("\n========== TEST 2: TOP 3 + 6TH + 7TH ==========")

    selected = all_scholarships[:3] + all_scholarships[5:7]

    conn = get_db_connection()
    try:
        sync_scholarships(selected)
        deleted = remove_missing_scholarships(selected, conn)

        print(f"Processed: {len(selected)} scholarships")
        print(f"Deleted: {deleted}")
    finally:
        conn.close()


if __name__ == "__main__":
    all_scholarships = fetch_all_scholarships()

    print(f"Total fetched from API: {len(all_scholarships)}")

    if len(all_scholarships) < 7:
        raise ValueError("API returned fewer than 7 scholarships.")

    run_test_1(all_scholarships)
    run_test_2(all_scholarships)