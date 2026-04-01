project(cpp_sample_03_result_details)

set(CMAKE_CXX_STANDARD 17)

add_executable(${PROJECT_NAME} 03_result_details.cpp)
target_link_libraries(${PROJECT_NAME} carmenVideoSDK_c)
