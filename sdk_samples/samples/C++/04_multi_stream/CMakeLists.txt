project(cpp_sample_04_multi_stream)

set(CMAKE_CXX_STANDARD 17)

add_executable(${PROJECT_NAME} 04_multi_stream.cpp)
target_link_libraries(${PROJECT_NAME} carmenVideoSDK_c)
