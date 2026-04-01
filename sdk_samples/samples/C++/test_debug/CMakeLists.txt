project(cpp_test_debug)

set(CMAKE_CXX_STANDARD 17)

add_executable(${PROJECT_NAME} test_debug.cpp)
target_link_libraries(${PROJECT_NAME} carmenVideoSDK_c)
