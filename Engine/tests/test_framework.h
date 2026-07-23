#pragma once
#include <iostream>
#include <string>

inline int g_failed_tests = 0;
inline int g_passed_tests = 0;

#define ASSERT_TRUE(expr) \
    do { \
        if (!(expr)) { \
            std::cerr << "Assertion failed: " << #expr << " at " << __FILE__ << ":" << __LINE__ << std::endl; \
            g_failed_tests++; \
            return; \
        } \
    } while (0)

#define ASSERT_EQ(val1, val2) \
    do { \
        if ((val1) != (val2)) { \
            std::cerr << "Assertion failed: " << #val1 << " == " << #val2 \
                      << " (Actual: " << (val1) << " vs " << (val2) << ") at " \
                      << __FILE__ << ":" << __LINE__ << std::endl; \
            g_failed_tests++; \
            return; \
        } \
    } while (0)

#define RUN_TEST(test_func) \
    do { \
        int failed_before = g_failed_tests; \
        std::cout << "[RUNNING] " << #test_func << std::endl; \
        test_func(); \
        if (g_failed_tests == failed_before) { \
            std::cout << "[PASSED ] " << #test_func << std::endl; \
            g_passed_tests++; \
        } else { \
            std::cout << "[FAILED ] " << #test_func << std::endl; \
        } \
    } while (0)
