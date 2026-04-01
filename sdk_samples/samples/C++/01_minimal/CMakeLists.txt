project(cpp_sample_01_minimal)

set(CMAKE_CXX_STANDARD 17)

add_executable(${PROJECT_NAME} 01_minimal.cpp)
target_link_libraries(${PROJECT_NAME} carmenVideoSDK_c)
